import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema/users'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import type { SafeUser } from '@/lib/db/schema/users'

// ─── Helper ───────────────────────────────────────────────────────────────────

function omitSensitive(row: Record<string, unknown>): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, resetPasswordToken, ...safe } = row as any
  return safe as SafeUser
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const activateSchema = z.object({
  status: z.enum(['active', 'inactive']),
})

// ─── POST /api/users/[id]/activate ───────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Session
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. Ability
  const ability = defineAbilityFor(user)
  if (!ability.can('activate', 'User')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Coerce + validate id
  const { id } = await params
  const numId = Number(id)
  if (!Number.isFinite(numId) || numId <= 0) {
    return NextResponse.json(
      { error: { message: 'Invalid user id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const parsed = activateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { status } = parsed.data

  // 5. Self-protection — cannot deactivate yourself
  if (numId === user.id && status === 'inactive') {
    return NextResponse.json(
      { error: { message: 'You cannot modify your own account status', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 6. Confirm target exists
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, numId), isNull(users.deletedAt)))
    .limit(1)

  if (!target) {
    return NextResponse.json(
      { error: { message: 'User not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 7. Apply toggle
  const [updated] = await db
    .update(users)
    .set({
      status,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(users.id, numId), isNull(users.deletedAt)))
    .returning()

  if (!updated) {
    return NextResponse.json(
      { error: { message: 'User not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  return NextResponse.json({ data: omitSensitive(updated as any) })
}
