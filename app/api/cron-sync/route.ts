import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull, like, or, desc, asc, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { syncSchedules } from '@/lib/db/schema/cron-sync'
import { connections } from '@/lib/db/schema/connections'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { isValidCronExpression, computeNextRunAt } from '@/lib/cron-sync/cron'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
  search:       z.string().optional(),
  connectionId: z.coerce.number().int().positive().optional(),
  target:       z.enum(['products', 'orders', 'customers']).optional(),
  enabled:      z.enum(['true', 'false']).optional(),
  sort:         z.string().optional(),
  order:        z.enum(['asc', 'desc']).default('desc'),
})

const createSchema = z.object({
  connectionId:   z.number().int().positive(),
  target:         z.enum(['products', 'orders', 'customers']),
  cronExpression: z
    .string()
    .trim()
    .min(9)
    .max(120)
    .refine(isValidCronExpression, {
      message: 'Invalid cron expression',
      path: ['cronExpression'],
    }),
  enabled: z.boolean().default(true),
})

// ─── GET /api/cron-sync ───────────────────────────────────────────────────────

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
  if (!ability.can('read', 'SyncSchedule')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Parse query
  const parsed = listQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Invalid query', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { page, limit, search, connectionId, target, enabled, sort, order } = parsed.data
  const offset = (page - 1) * limit

  // 4. Build WHERE conditions
  const conditions = [isNull(syncSchedules.deletedAt)]

  if (connectionId !== undefined) {
    conditions.push(eq(syncSchedules.connectionId, connectionId))
  }
  if (target !== undefined) {
    conditions.push(eq(syncSchedules.target, target))
  }
  if (enabled !== undefined) {
    conditions.push(eq(syncSchedules.enabled, enabled === 'true'))
  }
  if (search) {
    conditions.push(
      or(
        like(syncSchedules.cronExpression, `%${search}%`),
        like(connections.name, `%${search}%`),
      )!,
    )
  }

  const whereClause = and(...conditions)

  // 5. Determine ORDER BY
  const allowedSortCols: Record<string, Parameters<typeof asc>[0]> = {
    createdAt:  syncSchedules.createdAt,
    updatedAt:  syncSchedules.updatedAt,
    lastRunAt:  syncSchedules.lastRunAt,
    nextRunAt:  syncSchedules.nextRunAt,
    target:     syncSchedules.target,
    enabled:    syncSchedules.enabled,
    connection: connections.name,
  }
  const sortCol  = (sort && allowedSortCols[sort]) ? allowedSortCols[sort] : syncSchedules.createdAt
  const orderFn  = order === 'asc' ? asc : desc

  // 6. Query — join connection for name/platform + count
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id:             syncSchedules.id,
        connectionId:   syncSchedules.connectionId,
        target:         syncSchedules.target,
        cronExpression: syncSchedules.cronExpression,
        enabled:        syncSchedules.enabled,
        lastRunAt:      syncSchedules.lastRunAt,
        nextRunAt:      syncSchedules.nextRunAt,
        createdAt:      syncSchedules.createdAt,
        updatedAt:      syncSchedules.updatedAt,
        deletedAt:      syncSchedules.deletedAt,
        connection: {
          id:       connections.id,
          name:     connections.name,
          platform: connections.type,
        },
      })
      .from(syncSchedules)
      .innerJoin(connections, eq(syncSchedules.connectionId, connections.id))
      .where(whereClause)
      .orderBy(orderFn(sortCol))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(syncSchedules)
      .innerJoin(connections, eq(syncSchedules.connectionId, connections.id))
      .where(whereClause),
  ])

  return NextResponse.json({
    data: rows,
    meta: { total: Number(count), page, limit },
  })
}

// ─── POST /api/cron-sync ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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
  if (!ability.can('create', 'SyncSchedule')) {
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

  const { connectionId, target, cronExpression, enabled } = parsed.data

  // 4. Verify connection exists and is not soft-deleted
  const [conn] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.id, connectionId), isNull(connections.deletedAt)))
    .limit(1)

  if (!conn) {
    return NextResponse.json(
      { error: { message: 'Connection not found', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 5. Uniqueness check — no non-deleted schedule for (connectionId, target)
  const [existing] = await db
    .select({ id: syncSchedules.id })
    .from(syncSchedules)
    .where(
      and(
        eq(syncSchedules.connectionId, connectionId),
        eq(syncSchedules.target, target),
        isNull(syncSchedules.deletedAt),
      ),
    )
    .limit(1)

  if (existing) {
    return NextResponse.json(
      { error: { message: 'A schedule already exists for this connection and target', code: 'CONFLICT' } },
      { status: 409 },
    )
  }

  // 6. Compute nextRunAt (stub — returns null until cron-parser is installed)
  const nextRunAt = computeNextRunAt(cronExpression)

  // 7. Insert
  try {
    const [row] = await db
      .insert(syncSchedules)
      .values({ connectionId, target, cronExpression, enabled, nextRunAt })
      .returning()

    return NextResponse.json({ data: row }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/cron-sync] create failed', message)
    return NextResponse.json(
      { error: { message: 'Failed to create schedule', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
