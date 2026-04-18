import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull, like, or, desc, asc, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema/users'
import { roles } from '@/lib/db/schema/roles'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { hashPassword } from '@/lib/auth/password'
import type { SafeUser } from '@/lib/db/schema/users'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function omitSensitive(row: Record<string, unknown>): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, resetPasswordToken, ...safe } = row as any
  return safe as SafeUser
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  search:   z.string().optional(),
  status:   z.enum(['active', 'inactive']).optional(),
  roleId:   z.coerce.number().int().positive().optional(),
  userType: z.enum(['superadmin', 'admin', 'user']).optional(),
  sort:     z.string().optional(),
  order:    z.enum(['asc', 'desc']).default('desc'),
})

const createSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName:  z.string().trim().min(1).max(80),
  email:     z.string().trim().toLowerCase().email().max(254),
  password:  z.string().min(8).max(128),
  contactNo: z.string().trim().max(40).optional().nullable(),
  image:     z.string().url().max(500).optional().nullable(),
  status:    z.enum(['active', 'inactive']).default('active'),
  userType:  z.enum(['superadmin', 'admin', 'user']).default('admin'),
  roleId:    z.number().int().positive().optional().nullable(),
  portal:    z.string().trim().max(60).optional().nullable(),
})

// ─── Allowed sort columns ─────────────────────────────────────────────────────

const sortableColumns: Record<string, typeof users[keyof typeof users]> = {
  firstName: users.firstName,
  lastName:  users.lastName,
  email:     users.email,
  userType:  users.userType,
  status:    users.status,
  createdAt: users.createdAt,
}

// ─── GET /api/users ───────────────────────────────────────────────────────────

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
  if (!ability.can('read', 'User')) {
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

  const { page, limit, search, status, roleId, userType, sort, order } = parsed.data
  const offset = (page - 1) * limit

  // 4. Build where conditions
  const conditions = [isNull(users.deletedAt)]

  if (search) {
    conditions.push(
      or(
        like(users.firstName, `%${search}%`),
        like(users.lastName, `%${search}%`),
        like(users.email, `%${search}%`),
      )!,
    )
  }
  if (status) {
    conditions.push(eq(users.status, status))
  }
  if (roleId) {
    conditions.push(eq(users.roleId, roleId))
  }
  if (userType) {
    conditions.push(eq(users.userType, userType))
  }

  const whereClause = and(...conditions)

  // Resolve sort column — default createdAt desc
  const sortCol = (sort && sortableColumns[sort]) ? sortableColumns[sort] : users.createdAt
  const orderBy = order === 'asc' ? asc(sortCol as any) : desc(sortCol as any)

  // 5. Query + count
  const [rows, [{ count }]] = await Promise.all([
    db
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
        role:      { id: roles.id, name: roles.name },
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause),
  ])

  const normalized = rows.map((r) => ({
    ...r,
    role: r.role && r.role.id != null ? r.role : null,
  }))

  return NextResponse.json({
    data: normalized,
    meta: { total: Number(count), page, limit },
  })
}

// ─── POST /api/users ──────────────────────────────────────────────────────────

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
  if (!ability.can('create', 'User')) {
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

  const data = parsed.data

  // 3a. Non-superadmin cannot create superadmin
  if (data.userType === 'superadmin' && user.userType !== 'superadmin') {
    return NextResponse.json(
      { error: { message: 'Only superadmins can create superadmin accounts', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3b. Validate roleId exists (if provided)
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

  // 3c. Check email uniqueness (non-deleted rows)
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, data.email), isNull(users.deletedAt)))
    .limit(1)

  if (existing) {
    return NextResponse.json(
      { error: { message: 'A user with this email already exists', code: 'CONFLICT' } },
      { status: 409 },
    )
  }

  // 4. Hash password
  const hashedPassword = await hashPassword(data.password)

  try {
    const [row] = await db
      .insert(users)
      .values({
        firstName: data.firstName,
        lastName:  data.lastName,
        email:     data.email,
        password:  hashedPassword,
        contactNo: data.contactNo ?? null,
        image:     data.image ?? null,
        status:    data.status,
        userType:  data.userType,
        roleId:    data.roleId ?? null,
        portal:    data.portal ?? null,
      })
      .returning()

    return NextResponse.json({ data: omitSensitive(row as any) }, { status: 201 })
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
    console.error('[api/users] create failed', err?.message)
    return NextResponse.json(
      { error: { message: 'Failed to create user', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
