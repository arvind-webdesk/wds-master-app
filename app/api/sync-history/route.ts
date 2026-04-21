import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lte, like, desc, asc, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { syncRuns } from '@/lib/db/schema/integrations'
import { users } from '@/lib/db/schema/users'
import { connections } from '@/lib/db/schema/connections'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { listQuerySchema } from './_validation'

// ─── GET /api/sync-history ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Session
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. CASL
  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'SyncRun')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Validate query params
  const parsed = listQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: parsed.error.issues[0]?.message ?? 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
        },
      },
      { status: 422 },
    )
  }

  const {
    page, limit, sort, order,
    platform, target, status, connectionId, triggeredBy,
    dateFrom, dateTo, q,
  } = parsed.data

  // Cross-validate date range
  if (dateFrom && dateTo) {
    const from = Date.parse(dateFrom)
    const to   = Date.parse(dateTo)
    if (Number.isNaN(from) || Number.isNaN(to)) {
      return NextResponse.json(
        { error: { message: 'dateFrom or dateTo is not a valid date string', code: 'VALIDATION_ERROR' } },
        { status: 422 },
      )
    }
    if (from > to) {
      return NextResponse.json(
        { error: { message: 'dateFrom must not be later than dateTo', code: 'VALIDATION_ERROR' } },
        { status: 422 },
      )
    }
  } else if (dateFrom && Number.isNaN(Date.parse(dateFrom))) {
    return NextResponse.json(
      { error: { message: 'dateFrom is not a valid date string', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  } else if (dateTo && Number.isNaN(Date.parse(dateTo))) {
    return NextResponse.json(
      { error: { message: 'dateTo is not a valid date string', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Build WHERE conditions (no deletedAt — table is append-only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = []

  if (platform)     conditions.push(eq(syncRuns.platform, platform))
  if (target)       conditions.push(eq(syncRuns.target, target))
  if (status)       conditions.push(eq(syncRuns.status, status))
  if (connectionId) conditions.push(eq(syncRuns.connectionId, connectionId))
  if (triggeredBy)  conditions.push(eq(syncRuns.triggeredBy, triggeredBy))
  if (dateFrom)     conditions.push(gte(syncRuns.startedAt, dateFrom))
  if (dateTo)       conditions.push(lte(syncRuns.startedAt, dateTo))

  const trimmedQ = q?.trim() ?? ''
  if (trimmedQ.length > 0) {
    conditions.push(like(syncRuns.error, `%${trimmedQ}%`))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // 5. Build ORDER BY
  const sortExpr = (() => {
    const dirAsc  = <T extends Parameters<typeof asc>[0]>(col: T)  => asc(col)
    const dirDesc = <T extends Parameters<typeof desc>[0]>(col: T) => desc(col)
    const dir     = <T extends Parameters<typeof asc>[0]>(col: T)  =>
      order === 'asc' ? dirAsc(col) : dirDesc(col)

    switch (sort) {
      case 'finishedAt':      return dir(syncRuns.finishedAt)
      case 'durationMs':
        return order === 'asc'
          ? asc(sql`(julianday(${syncRuns.finishedAt}) - julianday(${syncRuns.startedAt}))`)
          : desc(sql`(julianday(${syncRuns.finishedAt}) - julianday(${syncRuns.startedAt}))`)
      case 'recordsSeen':     return dir(syncRuns.recordsSeen)
      case 'recordsUpserted': return dir(syncRuns.recordsUpserted)
      case 'startedAt':
      default:                return dir(syncRuns.startedAt)
    }
  })()

  const offset = (page - 1) * limit

  // 6. Run queries in parallel
  try {
    const [rows, countResult] = await Promise.all([
      db
        .select({
          id:               syncRuns.id,
          platform:         syncRuns.platform,
          target:           syncRuns.target,
          status:           syncRuns.status,
          recordsSeen:      syncRuns.recordsSeen,
          recordsUpserted:  syncRuns.recordsUpserted,
          startedAt:        syncRuns.startedAt,
          finishedAt:       syncRuns.finishedAt,
          connectionId:     syncRuns.connectionId,
          triggeredBy:      syncRuns.triggeredBy,
          // error text excluded from list projection; hasError derived via SQL
          hasError:         sql<number>`CASE WHEN ${syncRuns.error} IS NOT NULL AND ${syncRuns.error} != '' THEN 1 ELSE 0 END`,
          connectionName:   connections.name,
          triggeredByFirst: users.firstName,
          triggeredByLast:  users.lastName,
          triggeredByEmail: users.email,
        })
        .from(syncRuns)
        .leftJoin(connections, eq(syncRuns.connectionId, connections.id))
        .leftJoin(users, eq(syncRuns.triggeredBy, users.id))
        .where(whereClause)
        .orderBy(sortExpr)
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`count(*)` })
        .from(syncRuns)
        .where(whereClause),
    ])

    const total      = Number(countResult[0]?.count ?? 0)
    const totalPages = Math.ceil(total / limit)

    const data = rows.map((row) => {
      const durationMs =
        row.finishedAt && row.startedAt
          ? Math.max(0, Date.parse(row.finishedAt) - Date.parse(row.startedAt))
          : null

      const triggeredByLabel = row.triggeredByFirst
        ? `${row.triggeredByFirst} ${row.triggeredByLast ?? ''}`.trim() || (row.triggeredByEmail ?? null)
        : null

      return {
        id:               row.id,
        platform:         row.platform,
        target:           row.target,
        status:           row.status,
        recordsSeen:      row.recordsSeen,
        recordsUpserted:  row.recordsUpserted,
        startedAt:        row.startedAt,
        finishedAt:       row.finishedAt ?? null,
        durationMs,
        connectionId:     row.connectionId ?? null,
        connectionName:   row.connectionName ?? null,
        triggeredBy:      row.triggeredBy ?? null,
        triggeredByLabel: triggeredByLabel ?? null,
        hasError:         row.hasError === 1,
      }
    })

    return NextResponse.json({
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        sort,
        order,
        filters: {
          platform:     platform     ?? null,
          target:       target       ?? null,
          status:       status       ?? null,
          connectionId: connectionId ?? null,
          triggeredBy:  triggeredBy  ?? null,
          dateFrom:     dateFrom     ?? null,
          dateTo:       dateTo       ?? null,
          q:            trimmedQ || null,
        },
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/sync-history] list query failed', message)
    return NextResponse.json(
      { error: { message: 'Failed to fetch sync history', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
