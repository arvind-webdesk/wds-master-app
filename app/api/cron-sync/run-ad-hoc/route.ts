import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { syncJobs } from '@/lib/db/schema/cron-sync'
import { connections } from '@/lib/db/schema/connections'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { runJob } from '@/lib/cron-sync/run-job'

// ─── Schema ───────────────────────────────────────────────────────────────────

const adHocSchema = z.object({
  connectionId: z.number().int().positive(),
  target:       z.enum(['products', 'orders', 'customers']),
})

// ─── POST /api/cron-sync/run-ad-hoc ──────────────────────────────────────────
//
// Same behaviour as POST /api/cron-sync/[id]/run but accepts { connectionId, target }
// directly, no schedule required.
// Returns { jobId, status: 'queued' } immediately (HTTP 202).

export async function POST(req: NextRequest) {
  // 1. Session
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. CASL — "trigger a run" piggy-backs on update SyncSchedule
  const ability = defineAbilityFor(user)
  if (!ability.can('update', 'SyncSchedule')) {
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

  const parsed = adHocSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { connectionId, target } = parsed.data

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

  // 5. Concurrency guard
  const [activeJob] = await db
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.connectionId, connectionId),
        eq(syncJobs.target, target),
        or(eq(syncJobs.status, 'queued'), eq(syncJobs.status, 'running'))!,
      ),
    )
    .limit(1)

  if (activeJob) {
    return NextResponse.json(
      { error: { message: 'A sync is already running for this connection and target', code: 'CONFLICT' } },
      { status: 409 },
    )
  }

  // 6. Insert sync_jobs row
  const [job] = await db
    .insert(syncJobs)
    .values({
      connectionId,
      target,
      status:          'queued',
      progress:        0,
      recordsSeen:     0,
      recordsUpserted: 0,
      triggeredBy:     user.id,
    })
    .returning()

  // 7. Fire-and-forget — scheduleId is null for ad-hoc (no lastRunAt bump)
  void runJob(job.id, null)

  // 8. Return 202 immediately
  return NextResponse.json(
    { data: { jobId: job.id, status: 'queued' as const } },
    { status: 202 },
  )
}
