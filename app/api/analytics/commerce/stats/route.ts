import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sql, eq, and, count, desc, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  integrationProducts,
  integrationOrders,
  integrationCustomers,
  syncRuns,
} from '@/lib/db/schema/integrations'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { MIDDLEWARE_PLATFORMS } from '@/lib/analytics/dashboard-view'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  platform:     z.enum(MIDDLEWARE_PLATFORMS as unknown as [string, ...string[]]),
  // Optional — when set, analytics is scoped to a single store; when omitted,
  // results aggregate across every connection of the given platform.
  connectionId: z.coerce.number().int().positive().optional(),
  days:         z.coerce.number().int().min(1).max(30).default(7),
  topLimit:     z.coerce.number().int().min(1).max(20).default(5),
})

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'Dashboard')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({
    platform:     searchParams.get('platform')     ?? undefined,
    connectionId: searchParams.get('connectionId') ?? undefined,
    days:         searchParams.get('days')         ?? undefined,
    topLimit:     searchParams.get('topLimit')     ?? undefined,
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

  const { platform, connectionId, days, topLimit } = parsed.data

  try {
    const windowStartSql = sql.raw(`'-${days - 1} days'`)

    // Compose a platform [+ optional connection] filter for each table.
    const scopeOrders    = connectionId
      ? and(eq(integrationOrders.platform, platform),    eq(integrationOrders.connectionId, connectionId))
      : eq(integrationOrders.platform, platform)
    const scopeProducts  = connectionId
      ? and(eq(integrationProducts.platform, platform),  eq(integrationProducts.connectionId, connectionId))
      : eq(integrationProducts.platform, platform)
    const scopeCustomers = connectionId
      ? and(eq(integrationCustomers.platform, platform), eq(integrationCustomers.connectionId, connectionId))
      : eq(integrationCustomers.platform, platform)
    const scopeSyncRuns  = connectionId
      ? and(eq(syncRuns.platform, platform),             eq(syncRuns.connectionId, connectionId))
      : eq(syncRuns.platform, platform)

    const [
      ordersTotalRow,
      revenueRow,
      productsTotalRow,
      customersTotalRow,
      newCustomersRow,
      ordersSeriesRows,
      revenueSeriesRows,
      statusBreakdownRows,
      topProductsRows,
      latestSyncRows,
    ] = await Promise.all([
      // Total orders (all time, within scope)
      db
        .select({ value: count() })
        .from(integrationOrders)
        .where(scopeOrders),

      // Revenue over the window (sum of totalPrice, cast to real)
      db
        .select({
          total: sql<number>`coalesce(sum(cast(${integrationOrders.totalPrice} as real)), 0)`,
          orders: sql<number>`count(*)`,
        })
        .from(integrationOrders)
        .where(
          and(
            scopeOrders,
            sql`date(${integrationOrders.placedAt}) >= date('now', ${windowStartSql})`,
          ),
        ),

      // Total products synced
      db
        .select({ value: count() })
        .from(integrationProducts)
        .where(scopeProducts),

      // Total customers synced
      db
        .select({ value: count() })
        .from(integrationCustomers)
        .where(scopeCustomers),

      // New customers within window (fallback to syncedAt since customers have no createdAt)
      db
        .select({ value: count() })
        .from(integrationCustomers)
        .where(
          and(
            scopeCustomers,
            sql`date(${integrationCustomers.syncedAt}) >= date('now', ${windowStartSql})`,
          ),
        ),

      // Orders per day
      db
        .select({
          day:   sql<string>`date(${integrationOrders.placedAt})`,
          total: sql<number>`count(*)`,
        })
        .from(integrationOrders)
        .where(
          and(
            scopeOrders,
            isNotNull(integrationOrders.placedAt),
            sql`date(${integrationOrders.placedAt}) >= date('now', ${windowStartSql})`,
          ),
        )
        .groupBy(sql`date(${integrationOrders.placedAt})`)
        .orderBy(sql`date(${integrationOrders.placedAt}) asc`),

      // Revenue per day
      db
        .select({
          day:   sql<string>`date(${integrationOrders.placedAt})`,
          total: sql<number>`coalesce(sum(cast(${integrationOrders.totalPrice} as real)), 0)`,
        })
        .from(integrationOrders)
        .where(
          and(
            scopeOrders,
            isNotNull(integrationOrders.placedAt),
            sql`date(${integrationOrders.placedAt}) >= date('now', ${windowStartSql})`,
          ),
        )
        .groupBy(sql`date(${integrationOrders.placedAt})`)
        .orderBy(sql`date(${integrationOrders.placedAt}) asc`),

      // Order status breakdown (within window)
      db
        .select({
          status: integrationOrders.status,
          total:  sql<number>`count(*)`,
        })
        .from(integrationOrders)
        .where(
          and(
            scopeOrders,
            sql`date(${integrationOrders.placedAt}) >= date('now', ${windowStartSql})`,
          ),
        )
        .groupBy(integrationOrders.status),

      // Top products by title (most recent N)
      db
        .select({
          id:       integrationProducts.id,
          title:    integrationProducts.title,
          sku:      integrationProducts.sku,
          price:    integrationProducts.price,
          currency: integrationProducts.currency,
          status:   integrationProducts.status,
          syncedAt: integrationProducts.syncedAt,
        })
        .from(integrationProducts)
        .where(scopeProducts)
        .orderBy(desc(integrationProducts.syncedAt))
        .limit(topLimit),

      // Latest sync run per target (for status row)
      db
        .select({
          target:     syncRuns.target,
          status:     syncRuns.status,
          startedAt:  syncRuns.startedAt,
          finishedAt: syncRuns.finishedAt,
          recordsUpserted: syncRuns.recordsUpserted,
          error:      syncRuns.error,
        })
        .from(syncRuns)
        .where(scopeSyncRuns)
        .orderBy(desc(syncRuns.startedAt))
        .limit(10),
    ])

    // Pick latest sync row per target
    const latestByTarget = new Map<string, (typeof latestSyncRows)[number]>()
    for (const row of latestSyncRows) {
      if (!latestByTarget.has(row.target)) latestByTarget.set(row.target, row)
    }
    const lastSync = Array.from(latestByTarget.values())

    // Detect the dominant currency of the window (first row wins)
    const currencyRow = await db
      .select({ currency: integrationOrders.currency })
      .from(integrationOrders)
      .where(and(scopeOrders, isNotNull(integrationOrders.currency)))
      .limit(1)
    const currency = currencyRow[0]?.currency ?? 'USD'

    // Densify orders + revenue series so every day in the window is present
    const ordersMap = new Map<string, number>()
    for (const r of ordersSeriesRows) ordersMap.set(r.day, Number(r.total ?? 0))

    const revenueMap = new Map<string, number>()
    for (const r of revenueSeriesRows) revenueMap.set(r.day, Number(r.total ?? 0))

    const ordersSeries: Array<{ day: string; total: number }> = []
    const revenueSeries: Array<{ day: string; total: number }> = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - i)
      const day = d.toISOString().slice(0, 10)
      ordersSeries.push({ day, total: ordersMap.get(day) ?? 0 })
      revenueSeries.push({ day, total: Number((revenueMap.get(day) ?? 0).toFixed(2)) })
    }

    const statusBreakdown = statusBreakdownRows.map((r) => ({
      status: r.status ?? 'unknown',
      total:  Number(r.total),
    }))

    return NextResponse.json({
      data: {
        platform,
        connectionId: connectionId ?? null,
        currency,
        kpis: {
          totalOrders:     ordersTotalRow[0]?.value ?? 0,
          totalProducts:   productsTotalRow[0]?.value ?? 0,
          totalCustomers:  customersTotalRow[0]?.value ?? 0,
          newCustomersWindow: newCustomersRow[0]?.value ?? 0,
          ordersWindow:    Number(revenueRow[0]?.orders ?? 0),
          revenueWindow:   Number((Number(revenueRow[0]?.total ?? 0)).toFixed(2)),
        },
        ordersSeries,
        revenueSeries,
        statusBreakdown,
        topProducts: topProductsRows,
        lastSync,
      },
      meta: { days, topLimit, platform, connectionId: connectionId ?? null },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    console.error('[analytics/commerce/stats] INTERNAL_ERROR:', message)
    return NextResponse.json(
      { error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
