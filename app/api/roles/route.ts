import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, asc, desc, eq, isNull, like, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { roles } from '@/lib/db/schema/roles'
import { users } from '@/lib/db/schema/users'
import { rolePermissions } from '@/lib/db/schema/role-permissions'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

// ─── Query schema ─────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sort:   z.enum(['name', 'createdAt']).default('name'),
  order:  z.enum(['asc', 'desc']).default('asc'),
})

// ─── Create schema ────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:        z.string().trim().min(1, 'Name is required').max(64, 'Max 64 characters'),
  description: z.string().trim().max(500, 'Max 500 characters').nullish(),
})

// ─── GET /api/roles ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
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

  // 3. Validate query
  const parsed = listQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Invalid query', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }
  const { page, limit, search, sort, order } = parsed.data
  const offset = (page - 1) * limit

  // 4. Where
  const conditions = [isNull(roles.deletedAt)]
  if (search) {
    conditions.push(
      or(
        like(roles.name, `%${search}%`),
        like(roles.description, `%${search}%`),
      )!,
    )
  }
  const whereClause = and(...conditions)

  // 5. Order-by
  const sortCol = sort === 'createdAt' ? roles.createdAt : roles.name
  const orderFn = order === 'desc' ? desc : asc

  // 6. Query — left-join users (non-deleted) and role_permissions for counts
  const [rows, [{ total }]] = await Promise.all([
    db
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
      .where(whereClause)
      .groupBy(roles.id)
      .orderBy(orderFn(sortCol))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`cast(count(*) as integer)` })
      .from(roles)
      .where(whereClause),
  ])

  return NextResponse.json({
    data: rows,
    meta: { total: Number(total), page, limit },
  })
}

// ─── POST /api/roles ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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
  if (!ability.can('create', 'Role')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Insert
  try {
    const [row] = await db.insert(roles).values(parsed.data).returning()
    return NextResponse.json({ data: row }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const code = (err as Record<string, unknown>)?.code
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(msg)) {
      return NextResponse.json(
        { error: { message: 'A role with that name already exists', code: 'CONFLICT' } },
        { status: 409 },
      )
    }
    console.error('[api/roles] create failed', msg)
    return NextResponse.json(
      { error: { message: 'Failed to create role', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
