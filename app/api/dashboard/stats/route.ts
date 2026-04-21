import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sql, isNull, eq, and, count } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema/users'
import { roles } from '@/lib/db/schema/roles'
import { apiLogs } from '@/lib/db/schema/api-logs'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(30)
    .default(7),
  activityLimit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10),
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
  if (!ability.can('read', 'Dashboard')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Validate query params
  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({
    days:          searchParams.get('days')          ?? undefined,
    activityLimit: searchParams.get('activityLimit') ?? undefined,
  })
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

  const { days, activityLimit } = parsed.data

  try {
    // 4. Run all queries in parallel
    const [
      totalUsersResult,
      activeUsersResult,
      totalRolesResult,
      apiCallsTodayResult,
      apiErrorsTodayResult,
      apiCallsSeriesRows,
      recentActivityRows,
      signupsSeriesRows,
      methodBreakdownRows,
      statusBreakdownRows,
      avgDurationSeriesRows,
    ] = await Promise.all([
      // totalUsers
      db
        .select({ value: count() })
        .from(users)
        .where(isNull(users.deletedAt)),

      // activeUsers
      db
        .select({ value: count() })
        .from(users)
        .where(and(isNull(users.deletedAt), eq(users.status, 'active'))),

      // totalRoles
      db
        .select({ value: count() })
        .from(roles)
        .where(isNull(roles.deletedAt)),

      // apiCallsToday
      db
        .select({ value: count() })
        .from(apiLogs)
        .where(
          and(
            isNull(apiLogs.deletedAt),
            sql`date(${apiLogs.createdAt}) = date('now')`,
          ),
        ),

      // apiErrorsToday
      db
        .select({ value: count() })
        .from(apiLogs)
        .where(
          and(
            isNull(apiLogs.deletedAt),
            sql`date(${apiLogs.createdAt}) = date('now')`,
            eq(apiLogs.isError, true),
          ),
        ),

      // apiCallsSeries — grouped by day over the requested window
      db
        .select({
          day:    sql<string>`date(${apiLogs.createdAt})`,
          total:  sql<number>`count(*)`,
          errors: sql<number>`sum(case when ${apiLogs.isError} = 1 then 1 else 0 end)`,
        })
        .from(apiLogs)
        .where(
          and(
            isNull(apiLogs.deletedAt),
            sql`date(${apiLogs.createdAt}) >= date('now', ${sql.raw(`'-${days - 1} days'`)})`,
          ),
        )
        .groupBy(sql`date(${apiLogs.createdAt})`)
        .orderBy(sql`date(${apiLogs.createdAt}) asc`),

      // recentActivity
      db
        .select({
          id:             apiLogs.id,
          logType:        apiLogs.logType,
          message:        apiLogs.message,
          method:         apiLogs.method,
          url:            apiLogs.url,
          responseStatus: apiLogs.responseStatus,
          isError:        apiLogs.isError,
          durationMs:     apiLogs.durationMs,
          createdAt:      apiLogs.createdAt,
        })
        .from(apiLogs)
        .where(isNull(apiLogs.deletedAt))
        .orderBy(sql`${apiLogs.createdAt} desc`)
        .limit(activityLimit),

      // signupsSeries — new users per day over the window
      db
        .select({
          day:   sql<string>`date(${users.createdAt})`,
          total: sql<number>`count(*)`,
        })
        .from(users)
        .where(
          and(
            isNull(users.deletedAt),
            sql`date(${users.createdAt}) >= date('now', ${sql.raw(`'-${days - 1} days'`)})`,
          ),
        )
        .groupBy(sql`date(${users.createdAt})`)
        .orderBy(sql`date(${users.createdAt}) asc`),

      // methodBreakdown — HTTP method distribution over the window
      db
        .select({
          method: apiLogs.method,
          total:  sql<number>`count(*)`,
        })
        .from(apiLogs)
        .where(
          and(
            isNull(apiLogs.deletedAt),
            sql`date(${apiLogs.createdAt}) >= date('now', ${sql.raw(`'-${days - 1} days'`)})`,
          ),
        )
        .groupBy(apiLogs.method),

      // statusBreakdown — grouped by status class (2xx, 3xx, 4xx, 5xx) over the window
      db
        .select({
          bucket: sql<string>`
            case
              when ${apiLogs.responseStatus} >= 500 then '5xx'
              when ${apiLogs.responseStatus} >= 400 then '4xx'
              when ${apiLogs.responseStatus} >= 300 then '3xx'
              when ${apiLogs.responseStatus} >= 200 then '2xx'
              else 'other'
            end
          `,
          total: sql<number>`count(*)`,
        })
        .from(apiLogs)
        .where(
          and(
            isNull(apiLogs.deletedAt),
            sql`date(${apiLogs.createdAt}) >= date('now', ${sql.raw(`'-${days - 1} days'`)})`,
          ),
        )
        .groupBy(sql`
          case
            when ${apiLogs.responseStatus} >= 500 then '5xx'
            when ${apiLogs.responseStatus} >= 400 then '4xx'
            when ${apiLogs.responseStatus} >= 300 then '3xx'
            when ${apiLogs.responseStatus} >= 200 then '2xx'
            else 'other'
          end
        `),

      // avgDurationSeries — average response time per day over the window
      db
        .select({
          day:   sql<string>`date(${apiLogs.createdAt})`,
          avgMs: sql<number>`coalesce(avg(${apiLogs.durationMs}), 0)`,
        })
        .from(apiLogs)
        .where(
          and(
            isNull(apiLogs.deletedAt),
            sql`date(${apiLogs.createdAt}) >= date('now', ${sql.raw(`'-${days - 1} days'`)})`,
          ),
        )
        .groupBy(sql`date(${apiLogs.createdAt})`)
        .orderBy(sql`date(${apiLogs.createdAt}) asc`),
    ])

    // 5. Densify the timeseries so every day in the window is present
    const seriesMap = new Map<string, { total: number; errors: number }>()
    for (const row of apiCallsSeriesRows) {
      seriesMap.set(row.day, {
        total:  Number(row.total),
        errors: Number(row.errors ?? 0),
      })
    }

    const apiCallsSeries: Array<{ day: string; total: number; errors: number }> = []
    for (let i = days - 1; i >= 0; i--) {
      // Build the day string that matches SQLite's date('now', '-N days') output (YYYY-MM-DD, UTC)
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - i)
      const day = d.toISOString().slice(0, 10)
      const entry = seriesMap.get(day)
      apiCallsSeries.push({
        day,
        total:  entry?.total  ?? 0,
        errors: entry?.errors ?? 0,
      })
    }

    // 5b. Densify signups + avg duration the same way
    const signupsMap = new Map<string, number>()
    for (const row of signupsSeriesRows) signupsMap.set(row.day, Number(row.total))

    const avgDurationMap = new Map<string, number>()
    for (const row of avgDurationSeriesRows) avgDurationMap.set(row.day, Number(row.avgMs ?? 0))

    const signupsSeries: Array<{ day: string; total: number }> = []
    const avgDurationSeries: Array<{ day: string; avgMs: number }> = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - i)
      const day = d.toISOString().slice(0, 10)
      signupsSeries.push({ day, total: signupsMap.get(day) ?? 0 })
      avgDurationSeries.push({ day, avgMs: Math.round(avgDurationMap.get(day) ?? 0) })
    }

    const methodBreakdown = methodBreakdownRows.map((r) => ({
      method: r.method ?? 'UNKNOWN',
      total:  Number(r.total),
    }))

    const statusBreakdown = statusBreakdownRows.map((r) => ({
      bucket: r.bucket ?? 'other',
      total:  Number(r.total),
    }))

    // 6. Return canonical response
    return NextResponse.json({
      data: {
        kpis: {
          totalUsers:     totalUsersResult[0]?.value    ?? 0,
          activeUsers:    activeUsersResult[0]?.value   ?? 0,
          totalRoles:     totalRolesResult[0]?.value    ?? 0,
          apiCallsToday:  apiCallsTodayResult[0]?.value ?? 0,
          apiErrorsToday: apiErrorsTodayResult[0]?.value ?? 0,
        },
        apiCallsSeries,
        signupsSeries,
        methodBreakdown,
        statusBreakdown,
        avgDurationSeries,
        recentActivity: recentActivityRows,
      },
      meta: {
        days,
        activityLimit,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    console.error('[dashboard/stats] INTERNAL_ERROR:', message)
    return NextResponse.json(
      { error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
