import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, gte, lte, like, sql, asc, desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activityLogs } from '@/lib/db/schema/activity-logs'
import { users } from '@/lib/db/schema/users'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

const listQuerySchema = z.object({
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
  userId:      z.coerce.number().int().positive().optional(),
  action:      z.string().trim().min(1).max(80).optional(),
  subjectType: z.string().trim().min(1).max(40).optional(),
  subjectId:   z.coerce.number().int().positive().optional(),
  dateFrom:    z.string().datetime().optional(),
  dateTo:      z.string().datetime().optional(),
  search:      z.string().trim().min(1).max(120).optional(),
  sort:        z.enum(['createdAt', 'action', 'subjectType', 'userId']).optional().default('createdAt'),
  order:       z.enum(['asc', 'desc']).optional().default('desc'),
})

export async function GET(req: NextRequest) {
  // 1. Session check
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. CASL check
  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'ActivityLog')) {
    return NextResponse.json(
      { error: { message: 'You do not have permission to view activity logs', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Parse query params
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries())
  const parsed = listQuerySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { page, limit, userId, action, subjectType, subjectId, dateFrom, dateTo, search, sort, order } = parsed.data

  // Cross-field validation
  if (dateFrom && dateTo && dateTo < dateFrom) {
    return NextResponse.json(
      { error: { message: 'dateTo must not be earlier than dateFrom', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Build where conditions
  const conditions = []

  if (userId !== undefined) {
    conditions.push(eq(activityLogs.userId, userId))
  }
  if (action !== undefined) {
    conditions.push(eq(activityLogs.action, action))
  }
  if (subjectType !== undefined) {
    conditions.push(eq(activityLogs.subjectType, subjectType))
  }
  if (subjectId !== undefined) {
    conditions.push(eq(activityLogs.subjectId, subjectId))
  }
  if (dateFrom !== undefined) {
    conditions.push(gte(activityLogs.createdAt, dateFrom))
  }
  if (dateTo !== undefined) {
    conditions.push(lte(activityLogs.createdAt, dateTo))
  }
  if (search !== undefined) {
    const pattern = `%${search}%`
    conditions.push(
      sql`(${activityLogs.action} LIKE ${pattern} OR ${activityLogs.subjectType} LIKE ${pattern} OR ${activityLogs.meta} LIKE ${pattern})`,
    )
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  // 5. Resolve sort column
  const sortColumn = (() => {
    switch (sort) {
      case 'action':      return activityLogs.action
      case 'subjectType': return activityLogs.subjectType
      case 'userId':      return activityLogs.userId
      default:            return activityLogs.createdAt
    }
  })()

  const orderDir = order === 'asc' ? asc(sortColumn) : desc(sortColumn)

  // 6. Total count
  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(activityLogs)
    .where(where)

  const total = Number(countRow?.total ?? 0)

  // 7. Paginated data with user join
  const offset = (page - 1) * limit

  const rows = await db
    .select({
      id:          activityLogs.id,
      userId:      activityLogs.userId,
      action:      activityLogs.action,
      subjectType: activityLogs.subjectType,
      subjectId:   activityLogs.subjectId,
      meta:        activityLogs.meta,
      ip:          activityLogs.ip,
      userAgent:   activityLogs.userAgent,
      createdAt:   activityLogs.createdAt,
      updatedAt:   activityLogs.updatedAt,
      user: {
        id:        users.id,
        firstName: users.firstName,
        lastName:  users.lastName,
        email:     users.email,
      },
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.userId))
    .where(where)
    .orderBy(orderDir)
    .limit(limit)
    .offset(offset)

  // Normalise: left-join rows have user columns null when no match
  const data = rows.map((row) => ({
    ...row,
    user:
      row.user.id !== null
        ? { id: row.user.id, firstName: row.user.firstName, lastName: row.user.lastName, email: row.user.email }
        : null,
  }))

  return NextResponse.json({
    data,
    meta: { total, page, limit },
  })
}
