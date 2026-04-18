import { NextRequest, NextResponse } from 'next/server'
import { and, asc, desc, eq, gte, isNull, like, lte, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { apiLogs } from '@/lib/db/schema/api-logs'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { listQuerySchema } from './_validation'

export async function GET(req: NextRequest) {
  // 1. Auth — session
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. ACL — CASL
  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'ApiLog')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Parse + validate query params
  const { searchParams } = req.nextUrl
  const raw = Object.fromEntries(searchParams.entries())

  const parsed = listQuerySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: parsed.error.issues[0]?.message ?? 'Validation failed',
          code: 'VALIDATION_ERROR',
        },
      },
      { status: 422 },
    )
  }

  const {
    page,
    limit,
    sort,
    order,
    method,
    status,
    errorOnly,
    from,
    to,
    q,
    logType,
    environment,
  } = parsed.data

  // 4. Build WHERE conditions
  const conditions = [isNull(apiLogs.deletedAt)]

  if (method) {
    conditions.push(eq(apiLogs.method, method))
  }

  if (status !== undefined) {
    const STATUS_BUCKETS = ['1xx', '2xx', '3xx', '4xx', '5xx'] as const
    if ((STATUS_BUCKETS as readonly string[]).includes(status)) {
      const bucket = parseInt(status[0], 10)
      conditions.push(
        and(
          gte(apiLogs.responseStatus, bucket * 100),
          lte(apiLogs.responseStatus, bucket * 100 + 99),
        )!,
      )
    } else {
      conditions.push(eq(apiLogs.responseStatus, Number(status)))
    }
  }

  if (errorOnly) {
    conditions.push(eq(apiLogs.isError, true))
  }

  if (from) {
    conditions.push(gte(apiLogs.createdAt, from))
  }

  if (to) {
    conditions.push(lte(apiLogs.createdAt, to))
  }

  if (q) {
    const trimmed = q.trim()
    if (trimmed.length > 0) {
      const pattern = `%${trimmed}%`
      conditions.push(
        or(
          like(apiLogs.url, pattern),
          like(apiLogs.message, pattern),
          like(apiLogs.errorType, pattern),
          like(apiLogs.source, pattern),
        )!,
      )
    }
  }

  if (logType) {
    conditions.push(eq(apiLogs.logType, logType))
  }

  if (environment) {
    conditions.push(eq(apiLogs.environment, environment))
  }

  const where = and(...conditions)

  // 5. Determine sort column and direction
  const sortColumn = (() => {
    if (sort === 'responseStatus') return apiLogs.responseStatus
    if (sort === 'durationMs') return apiLogs.durationMs
    return apiLogs.createdAt
  })()

  const orderExpr = order === 'asc' ? asc(sortColumn) : desc(sortColumn)

  // 6. Count + paginated query
  try {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(apiLogs)
      .where(where)

    const offset = (page - 1) * limit

    const rows = await db
      .select({
        id:             apiLogs.id,
        createdAt:      apiLogs.createdAt,
        method:         apiLogs.method,
        url:            apiLogs.url,
        responseStatus: apiLogs.responseStatus,
        durationMs:     apiLogs.durationMs,
        isError:        apiLogs.isError,
        errorType:      apiLogs.errorType,
        source:         apiLogs.source,
        environment:    apiLogs.environment,
        ip:             apiLogs.ip,
        logType:        apiLogs.logType,
        message:        apiLogs.message,
      })
      .from(apiLogs)
      .where(where)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset)

    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      data: rows,
      meta: {
        page,
        limit,
        total,
        totalPages,
        sort,
        order,
        filters: {
          method:      method ?? null,
          status:      status ?? null,
          errorOnly,
          from:        from ?? null,
          to:          to ?? null,
          q:           q ?? null,
          logType:     logType ?? null,
          environment: environment ?? null,
        },
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error'
    console.error('[api-logs:list]', message)
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
