import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema/users'
import { roles } from '@/lib/db/schema/roles'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import type { SafeUser } from '@/lib/db/schema/users'

// ─── Helper ───────────────────────────────────────────────────────────────────

function omitSensitive(row: Record<string, unknown>): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, resetPasswordToken, ...safe } = row as any
  return safe as SafeUser
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName:  z.string().trim().min(1).max(80).optional(),
  email:     z.string().trim().toLowerCase().email().max(254).optional(),
  contactNo: z.string().trim().max(40).optional().nullable(),
  image:     z.string().url().max(500).optional().nullable(),
  status:    z.enum(['active', 'inactive']).optional(),
  userType:  z.enum(['superadmin', 'admin', 'user']).optional(),
  roleId:    z.number().int().positive().optional().nullable(),
  portal:    z.string().trim().max(60).optional().nullable(),
})

// ─── GET /api/users/[id] ──────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
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
  if (!ability.can('read', 'User')) {
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

  // 4. Fetch user with role join
  const [row] = await db
    .select({
      id:        users.id,
      firstName: users.firstName,
      lastName:  users.lastName,
      email:     users.email,
      contactNo: users.contactNo,
      image:     users.image,
      status:    users.status,
      userType:  users.userType,
      roleId:    users.roleId,
      portal:    users.portal,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
      role: {
        id:   roles.id,
        name: roles.name,
      },
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(users.id, numId), isNull(users.deletedAt)))
    .limit(1)

  if (!row) {
    return NextResponse.json(
      { error: { message: 'User not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // role will be { id: null, name: null } when no roleId — normalise to null
  const role =
    row.role && row.role.id !== null
      ? { id: row.role.id, name: row.role.name }
      : null

  return NextResponse.json({
    data: { ...omitSensitive(row as any), role },
  })
}

// ─── PATCH /api/users/[id] ────────────────────────────────────────────────────

export async function PATCH(
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
  if (!ability.can('update', 'User')) {
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

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const data = parsed.data

  // 4a. Non-superadmin cannot elevate to superadmin
  if (data.userType === 'superadmin' && user.userType !== 'superadmin') {
    return NextResponse.json(
      { error: { message: 'Only superadmins can assign the superadmin role', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 4b. Confirm target exists
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

  // 4c. Validate roleId if supplied
  if (data.roleId != null) {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.id, data.roleId), isNull(roles.deletedAt)))
      .limit(1)

    if (!role) {
      return NextResponse.json(
        { error: { message: 'The selected role does not exist', code: 'VALIDATION_ERROR' } },
        { status: 422 },
      )
    }
  }

  // 4d. Email uniqueness — must not belong to another non-deleted user
  if (data.email) {
    const [dup] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.email, data.email),
          isNull(users.deletedAt),
          ne(users.id, numId),
        ),
      )
      .limit(1)

    if (dup) {
      return NextResponse.json(
        { error: { message: 'A user with this email already exists', code: 'CONFLICT' } },
        { status: 409 },
      )
    }
  }

  try {
    const [updated] = await db
      .update(users)
      .set({
        ...data,
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
  } catch (err: any) {
    if (
      err?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      /UNIQUE constraint failed/i.test(String(err?.message))
    ) {
      return NextResponse.json(
        { error: { message: 'A user with this email already exists', code: 'CONFLICT' } },
        { status: 409 },
      )
    }
    console.error('[api/users/:id] update failed', err?.message)
    return NextResponse.json(
      { error: { message: 'Failed to update user', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/users/[id] ───────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
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
  if (!ability.can('delete', 'User')) {
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

  // 4. Self-protection
  if (numId === user.id) {
    return NextResponse.json(
      { error: { message: 'You cannot modify your own account status', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 5. Confirm target exists
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

  // 6. Soft-delete
  await db
    .update(users)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(users.id, numId))

  return NextResponse.json({ data: { id: numId } })
}
