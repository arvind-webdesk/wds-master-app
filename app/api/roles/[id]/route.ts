import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { roles } from '@/lib/db/schema/roles'
import { users } from '@/lib/db/schema/users'
import { rolePermissions } from '@/lib/db/schema/role-permissions'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

// ─── PATCH schema ─────────────────────────────────────────────────────────────

const patchSchema = z.object({
  name:        z.string().trim().min(1, 'Name is required').max(64, 'Max 64 characters').optional(),
  description: z.string().trim().max(500, 'Max 500 characters').nullish(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve and validate the `id` path param. Returns null when invalid. */
async function resolveId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params
  const num = Number(id)
  return Number.isFinite(num) && num > 0 ? num : null
}

/** Fetch a single role with user/permission counts. Returns null when not found. */
async function fetchRoleWithCounts(roleId: number) {
  const [row] = await db
    .select({
      id:              roles.id,
      name:            roles.name,
      description:     roles.description,
      createdAt:       roles.createdAt,
      updatedAt:       roles.updatedAt,
      deletedAt:       roles.deletedAt,
      userCount:       sql<number>`cast(count(distinct case when ${users.deletedAt} is null then ${users.id} end) as integer)`,
      permissionCount: sql<number>`cast(count(distinct ${rolePermissions.id}) as integer)`,
    })
    .from(roles)
    .leftJoin(users, eq(users.roleId, roles.id))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)))
    .groupBy(roles.id)
    .limit(1)

  return row ?? null
}

// ─── GET /api/roles/[id] ──────────────────────────────────────────────────────

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
  if (!ability.can('read', 'Role')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Param
  const roleId = await resolveId(params)
  if (!roleId) {
    return NextResponse.json(
      { error: { message: 'Invalid role id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Fetch
  const row = await fetchRoleWithCounts(roleId)
  if (!row) {
    return NextResponse.json(
      { error: { message: 'Role not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  return NextResponse.json({ data: row })
}

// ─── PATCH /api/roles/[id] ────────────────────────────────────────────────────

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
  if (!ability.can('update', 'Role')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Param
  const roleId = await resolveId(params)
  if (!roleId) {
    return NextResponse.json(
      { error: { message: 'Invalid role id', code: 'VALIDATION_ERROR' } },
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

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // Ensure the role exists and is not soft-deleted
  const existing = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)))
    .limit(1)

  if (!existing.length) {
    return NextResponse.json(
      { error: { message: 'Role not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 5. Update
  try {
    const [updated] = await db
      .update(roles)
      .set({ ...parsed.data, updatedAt: new Date().toISOString() })
      .where(eq(roles.id, roleId))
      .returning()

    return NextResponse.json({ data: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const code = (err as Record<string, unknown>)?.code
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(msg)) {
      return NextResponse.json(
        { error: { message: 'A role with that name already exists', code: 'CONFLICT' } },
        { status: 409 },
      )
    }
    console.error('[api/roles] update failed', msg)
    return NextResponse.json(
      { error: { message: 'Failed to update role', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/roles/[id] ───────────────────────────────────────────────────

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
  if (!ability.can('delete', 'Role')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Param
  const roleId = await resolveId(params)
  if (!roleId) {
    return NextResponse.json(
      { error: { message: 'Invalid role id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Ensure role exists and is not already deleted
  const [existing] = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json(
      { error: { message: 'Role not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 5. Refuse to delete the superadmin role
  if (existing.name.toLowerCase() === 'superadmin') {
    return NextResponse.json(
      { error: { message: 'Cannot delete the superadmin role', code: 'CONFLICT' } },
      { status: 409 },
    )
  }

  // 6. Refuse if any non-deleted users still reference this role
  const [{ activeUserCount }] = await db
    .select({ activeUserCount: sql<number>`cast(count(*) as integer)` })
    .from(users)
    .where(and(eq(users.roleId, roleId), isNull(users.deletedAt)))

  if (Number(activeUserCount) > 0) {
    return NextResponse.json(
      { error: { message: 'Cannot delete a role that is assigned to active users. Reassign users first.', code: 'CONFLICT' } },
      { status: 409 },
    )
  }

  // 7. Soft delete
  await db
    .update(roles)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(roles.id, roleId))

  return NextResponse.json({ data: { id: roleId } })
}
