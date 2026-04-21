import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { syncSchedules } from '@/lib/db/schema/cron-sync'
import { connections } from '@/lib/db/schema/connections'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { isValidCronExpression, computeNextRunAt } from '@/lib/cron-sync/cron'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const updateSchema = z
  .object({
    connectionId: z.number().int().positive().optional(),
    target:       z.enum(['products', 'orders', 'customers']).optional(),
    cronExpression: z
      .string()
      .trim()
      .min(9)
      .max(120)
      .refine(isValidCronExpression, {
        message: 'Invalid cron expression',
        path: ['cronExpression'],
      })
      .optional(),
    enabled: z.boolean().optional(),
  })
  .strict()

// ─── GET /api/cron-sync/[id] ──────────────────────────────────────────────────

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

  // 2. CASL
  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'SyncSchedule')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Coerce + validate id
  const { id } = await params
  const numId = Number(id)
  if (!Number.isFinite(numId)) {
    return NextResponse.json(
      { error: { message: 'Invalid id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Fetch with connection join
  const [row] = await db
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
    .where(and(eq(syncSchedules.id, numId), isNull(syncSchedules.deletedAt)))
    .limit(1)

  if (!row) {
    return NextResponse.json(
      { error: { message: 'Schedule not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  return NextResponse.json({ data: row })
}

// ─── PATCH /api/cron-sync/[id] ────────────────────────────────────────────────

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

  // 2. CASL
  const ability = defineAbilityFor(user)
  if (!ability.can('update', 'SyncSchedule')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Coerce + validate id
  const { id } = await params
  const numId = Number(id)
  if (!Number.isFinite(numId)) {
    return NextResponse.json(
      { error: { message: 'Invalid id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Verify schedule exists
  const [schedule] = await db
    .select()
    .from(syncSchedules)
    .where(and(eq(syncSchedules.id, numId), isNull(syncSchedules.deletedAt)))
    .limit(1)

  if (!schedule) {
    return NextResponse.json(
      { error: { message: 'Schedule not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 5. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const updates = parsed.data

  // 6. If connectionId is being changed, verify new connection exists
  if (updates.connectionId !== undefined) {
    const [conn] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.id, updates.connectionId), isNull(connections.deletedAt)))
      .limit(1)

    if (!conn) {
      return NextResponse.json(
        { error: { message: 'Connection not found', code: 'VALIDATION_ERROR' } },
        { status: 422 },
      )
    }
  }

  // 7. Uniqueness check — if connectionId or target changes, ensure no collision
  const effectiveConnectionId = updates.connectionId ?? schedule.connectionId
  const effectiveTarget       = updates.target       ?? schedule.target

  if (updates.connectionId !== undefined || updates.target !== undefined) {
    const [collision] = await db
      .select({ id: syncSchedules.id })
      .from(syncSchedules)
      .where(
        and(
          eq(syncSchedules.connectionId, effectiveConnectionId),
          eq(syncSchedules.target, effectiveTarget),
          isNull(syncSchedules.deletedAt),
          ne(syncSchedules.id, numId),
        ),
      )
      .limit(1)

    if (collision) {
      return NextResponse.json(
        { error: { message: 'A schedule already exists for this connection and target', code: 'CONFLICT' } },
        { status: 409 },
      )
    }
  }

  // 8. Recompute nextRunAt if cronExpression changed
  const cronExpression = updates.cronExpression ?? schedule.cronExpression
  const nextRunAt =
    updates.cronExpression !== undefined
      ? computeNextRunAt(cronExpression)
      : schedule.nextRunAt

  // 9. Apply update
  try {
    const [updated] = await db
      .update(syncSchedules)
      .set({
        ...updates,
        nextRunAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(syncSchedules.id, numId))
      .returning()

    return NextResponse.json({ data: updated })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/cron-sync] update failed', message)
    return NextResponse.json(
      { error: { message: 'Failed to update schedule', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/cron-sync/[id] ───────────────────────────────────────────────

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

  // 2. CASL
  const ability = defineAbilityFor(user)
  if (!ability.can('delete', 'SyncSchedule')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Coerce + validate id
  const { id } = await params
  const numId = Number(id)
  if (!Number.isFinite(numId)) {
    return NextResponse.json(
      { error: { message: 'Invalid id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Verify it exists
  const [schedule] = await db
    .select({ id: syncSchedules.id })
    .from(syncSchedules)
    .where(and(eq(syncSchedules.id, numId), isNull(syncSchedules.deletedAt)))
    .limit(1)

  if (!schedule) {
    return NextResponse.json(
      { error: { message: 'Schedule not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 5. Soft-delete
  await db
    .update(syncSchedules)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(syncSchedules.id, numId))

  return NextResponse.json({ data: { id: numId } })
}
