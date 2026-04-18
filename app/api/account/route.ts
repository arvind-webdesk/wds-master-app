import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema/users'
import type { SafeUser } from '@/lib/db/schema/users'
import { getSessionUser, getSession } from '@/lib/auth/session'
import { verifyPassword, hashPassword } from '@/lib/auth/password'

const patchBodySchema = z
  .object({
    firstName:       z.string().min(1).max(80).trim().optional(),
    lastName:        z.string().min(1).max(80).trim().optional(),
    contactNo:       z.string().min(5).max(40).nullable().optional(),
    image:           z.string().url().max(1024).nullable().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword:     z.string().min(8).max(128).optional(),
  })
  .superRefine((data, ctx) => {
    // newPassword requires currentPassword
    if (data.newPassword && !data.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'currentPassword is required when changing password',
        path: ['currentPassword'],
      })
    }
  })

function toSafeUser(user: typeof users.$inferSelect): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, resetPasswordToken, ...safe } = user
  return safe
}

// ─── GET /api/account ─────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  // 1. Session check — no CASL (self-read is inherent)
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. Fetch own row
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, user.id), isNull(users.deletedAt)))
    .limit(1)

  if (!row) {
    return NextResponse.json(
      { error: { message: 'User not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  return NextResponse.json({ data: toSafeUser(row) })
}

// ─── PATCH /api/account ───────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  // 1. Session check — no CASL (self-edit is inherent)
  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const parsed = patchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { firstName, lastName, contactNo, image, currentPassword, newPassword } = parsed.data

  // 3. Require at least one writable field
  const hasProfileField = firstName !== undefined || lastName !== undefined || contactNo !== undefined || image !== undefined
  const hasPasswordChange = newPassword !== undefined
  if (!hasProfileField && !hasPasswordChange) {
    return NextResponse.json(
      { error: { message: 'No fields provided for update', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Build update payload
  const updatePayload: Partial<typeof users.$inferInsert> & { updatedAt: string } = {
    updatedAt: new Date().toISOString(),
  }

  if (firstName !== undefined) updatePayload.firstName = firstName
  if (lastName  !== undefined) updatePayload.lastName  = lastName
  if (contactNo !== undefined) updatePayload.contactNo = contactNo
  if (image     !== undefined) updatePayload.image     = image

  // 5. Password change: verify then hash
  if (hasPasswordChange) {
    // Load user row to get stored hash
    const [userRow] = await db
      .select({ password: users.password })
      .from(users)
      .where(and(eq(users.id, sessionUser.id), isNull(users.deletedAt)))
      .limit(1)

    if (!userRow) {
      return NextResponse.json(
        { error: { message: 'User not found', code: 'NOT_FOUND' } },
        { status: 404 },
      )
    }

    const valid = await verifyPassword(currentPassword!, userRow.password)
    if (!valid) {
      return NextResponse.json(
        { error: { message: 'Current password is incorrect', code: 'VALIDATION_ERROR' } },
        { status: 422 },
      )
    }

    updatePayload.password = await hashPassword(newPassword!)
  }

  // 6. Apply update
  const [updated] = await db
    .update(users)
    .set(updatePayload)
    .where(and(eq(users.id, sessionUser.id), isNull(users.deletedAt)))
    .returning()

  if (!updated) {
    return NextResponse.json(
      { error: { message: 'User not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 7. Rebuild and save session so Topbar reflects name/image changes.
  const session = await getSession()
  if (session.user) {
    session.user = {
      ...session.user,
      firstName: updated.firstName,
      lastName:  updated.lastName,
    }
    // image is stored in the session blob by the login handler; keep it in sync.
    // Cast via unknown because SessionUser interface predates this field.
    ;(session.user as unknown as Record<string, unknown>)['image'] = updated.image ?? undefined
    await session.save()
  }

  return NextResponse.json({ data: toSafeUser(updated) })
}
