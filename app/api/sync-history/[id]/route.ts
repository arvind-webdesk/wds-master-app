import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { syncRuns } from '@/lib/db/schema/integrations'
import { users } from '@/lib/db/schema/users'
import { connections } from '@/lib/db/schema/connections'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { idParamSchema } from '../_validation'

// ---------------------------------------------------------------------------
// GET /api/sync-history/[id] — full record including joins
// sync_runs has no deletedAt — no soft-delete filter applied.
// ---------------------------------------------------------------------------
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
  if (!ability.can('read', 'SyncRun')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Validate path param
  const { id: rawId } = await params
  const idParsed = idParamSchema.safeParse(rawId)
  if (!idParsed.success) {
    return NextResponse.json(
      {
        error: {
          message: idParsed.error.issues[0]?.message ?? 'id must be a positive integer',
          code: 'VALIDATION_ERROR',
        },
      },
      { status: 422 },
    )
  }
  const id = idParsed.data

  // 4. Query — full row + joins
  try {
    const [row] = await db
      .select({
        id:               syncRuns.id,
        platform:         syncRuns.platform,
        target:           syncRuns.target,
        status:           syncRuns.status,
        recordsSeen:      syncRuns.recordsSeen,
        recordsUpserted:  syncRuns.recordsUpserted,
        error:            syncRuns.error,
        triggeredBy:      syncRuns.triggeredBy,
        startedAt:        syncRuns.startedAt,
        finishedAt:       syncRuns.finishedAt,
        connectionId:     syncRuns.connectionId,
        // joins
        connectionName:   connections.name,
        triggeredByFirst: users.firstName,
        triggeredByLast:  users.lastName,
        triggeredByEmail: users.email,
      })
      .from(syncRuns)
      .leftJoin(connections, eq(syncRuns.connectionId, connections.id))
      .leftJoin(users, eq(syncRuns.triggeredBy, users.id))
      .where(eq(syncRuns.id, id))
      .limit(1)

    if (!row) {
      return NextResponse.json(
        { error: { message: 'Sync run not found', code: 'NOT_FOUND' } },
        { status: 404 },
      )
    }

    // 5. Derive computed fields
    const durationMs =
      row.finishedAt && row.startedAt
        ? Math.max(0, Date.parse(row.finishedAt) - Date.parse(row.startedAt))
        : null

    const triggeredByLabel = row.triggeredByFirst
      ? `${row.triggeredByFirst} ${row.triggeredByLast}`.trim() ||
        (row.triggeredByEmail ?? null)
      : null

    return NextResponse.json({
      data: {
        id:               row.id,
        platform:         row.platform,
        target:           row.target,
        status:           row.status,
        recordsSeen:      row.recordsSeen,
        recordsUpserted:  row.recordsUpserted,
        error:            row.error         ?? null,
        triggeredBy:      row.triggeredBy   ?? null,
        triggeredByLabel: triggeredByLabel  ?? null,
        connectionId:     row.connectionId  ?? null,
        connectionName:   row.connectionName ?? null,
        startedAt:        row.startedAt,
        finishedAt:       row.finishedAt    ?? null,
        durationMs,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/sync-history/[id]] query failed:', message)
    return NextResponse.json(
      { error: { message: 'Failed to fetch sync run', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
