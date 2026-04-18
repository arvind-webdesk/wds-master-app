import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { roles } from '@/lib/db/schema/roles'
import { permissions } from '@/lib/db/schema/permissions'
import { rolePermissions } from '@/lib/db/schema/role-permissions'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { PERMISSION_MODULES } from '@/lib/acl/permissions-map'

// ─── PUT body schema ──────────────────────────────────────────────────────────

const putSchema = z.object({
  permissions: z.array(
    z.object({
      name:   z.string(),
      action: z.string(),
    }),
  ),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve and validate the `id` path param. Returns null when invalid. */
async function resolveId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params
  const num = Number(id)
  return Number.isFinite(num) && num > 0 ? num : null
}

/** Build a flat set of all valid (name, action) pairs from PERMISSION_MODULES. */
function buildValidPairs(): Set<string> {
  const set = new Set<string>()
  for (const mod of PERMISSION_MODULES) {
    for (const action of mod.actions) {
      set.add(`${mod.key}:${action}`)
    }
  }
  return set
}

// ─── GET /api/roles/[id]/permissions ─────────────────────────────────────────
//
// Returns every (module, action) pair from PERMISSION_MODULES with an `enabled`
// flag indicating whether a role_permissions row exists for this role.
// When the permissions row itself does not exist in the DB, `id` is null.

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

  // 4. Ensure role exists and is not soft-deleted
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)))
    .limit(1)

  if (!role) {
    return NextResponse.json(
      { error: { message: 'Role not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 5. Load all permissions from DB and which ones are enabled for this role
  const [allPerms, enabledRows] = await Promise.all([
    db.select().from(permissions),
    db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId)),
  ])

  // Build a lookup: permissionId → true for enabled rows
  const enabledSet = new Set(enabledRows.map((r) => r.permissionId))

  // Build a lookup: "name:action" → Permission row
  const permMap = new Map<string, (typeof allPerms)[number]>()
  for (const p of allPerms) {
    permMap.set(`${p.name}:${p.action}`, p)
  }

  // 6. Expand PERMISSION_MODULES into the full matrix, even when the DB row doesn't exist
  const result: Array<{
    id: number | null
    name: string
    action: string
    module: string
    enabled: boolean
  }> = []

  for (const mod of PERMISSION_MODULES) {
    for (const action of mod.actions) {
      const key = `${mod.key}:${action}`
      const dbPerm = permMap.get(key) ?? null
      result.push({
        id:      dbPerm?.id ?? null,
        name:    mod.key,
        action,
        module:  mod.label,
        enabled: dbPerm !== null && enabledSet.has(dbPerm.id),
      })
    }
  }

  return NextResponse.json({ data: { roleId, permissions: result } })
}

// ─── PUT /api/roles/[id]/permissions ─────────────────────────────────────────
//
// Replaces the full permission set for the role in a single transaction.
// Each submitted (name, action) pair must exist in PERMISSION_MODULES.
// If a permissions row for the pair doesn't yet exist in the DB it is upserted.
//
// Note: users who are currently logged in with this role retain their old
// permissions until their next login (abilities are seeded from the session
// at login time in app/api/auth/login/route.ts).

export async function PUT(
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

  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 5. Validate each submitted pair against PERMISSION_MODULES
  const validPairs = buildValidPairs()
  for (const pair of parsed.data.permissions) {
    if (!validPairs.has(`${pair.name}:${pair.action}`)) {
      return NextResponse.json(
        { error: { message: `Unknown permission: ${pair.name}:${pair.action}`, code: 'VALIDATION_ERROR' } },
        { status: 422 },
      )
    }
  }

  // 6. Ensure role exists and is not soft-deleted
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)))
    .limit(1)

  if (!role) {
    return NextResponse.json(
      { error: { message: 'Role not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 7. Replace permission set in a transaction
  try {
    let count = 0

    await db.transaction(async (tx) => {
      // a) Delete all existing role_permissions for this role
      await tx
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId))

      if (parsed.data.permissions.length === 0) {
        return
      }

      // b) Upsert missing permissions rows and collect their ids
      const permissionIds: number[] = []

      for (const pair of parsed.data.permissions) {
        // Find the module label from PERMISSION_MODULES
        const mod = PERMISSION_MODULES.find((m) => m.key === pair.name)
        const moduleLabel = mod?.label ?? pair.name

        // Try to find an existing permissions row
        const [existing] = await tx
          .select({ id: permissions.id })
          .from(permissions)
          .where(and(eq(permissions.name, pair.name), eq(permissions.action, pair.action)))
          .limit(1)

        if (existing) {
          permissionIds.push(existing.id)
        } else {
          // Insert the missing permissions row
          const [inserted] = await tx
            .insert(permissions)
            .values({ name: pair.name, action: pair.action, module: moduleLabel })
            .returning({ id: permissions.id })
          permissionIds.push(inserted.id)
        }
      }

      // c) Insert role_permissions rows
      await tx.insert(rolePermissions).values(
        permissionIds.map((permissionId) => ({ roleId, permissionId })),
      )

      count = permissionIds.length
    })

    return NextResponse.json({ data: { roleId, count } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/roles] permissions update failed', msg)
    return NextResponse.json(
      { error: { message: 'Failed to update permissions', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
