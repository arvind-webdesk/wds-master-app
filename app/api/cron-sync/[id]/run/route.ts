import { NextRequest, NextResponse } from 'next/server'
import { and, eq, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { syncSchedules, syncJobs } from '@/lib/db/schema/cron-sync'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { runJob } from '@/lib/cron-sync/run-job'

// ─── POST /api/cron-sync/[id]/run ─────────────────────────────────────────────
//
// Kicks off a manual run for a named schedule.
// Returns { jobId, status: 'queued' } immediately (HTTP 202).
// The actual work runs as a non-awaited background Promise (see lib/cron-sync/run-job.ts).

export async function POST(
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

  // 2. CASL — "trigger a run" piggy-backs on update SyncSchedule
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

  // 4. Fetch schedule
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

  // 5. Concurrency guard — reject if a non-terminal job already exists for same (connectionId, target)
  const [activeJob] = await db
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.connectionId, schedule.connectionId),
        eq(syncJobs.target, schedule.target),
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

  // 6. Insert sync_jobs row with status='queued'
  const [job] = await db
    .insert(syncJobs)
    .values({
      connectionId:    schedule.connectionId,
      target:          schedule.target,
      status:          'queued',
      progress:        0,
      recordsSeen:     0,
      recordsUpserted: 0,
      triggeredBy:     user.id,
    })
    .returning()

  // 7. Fire-and-forget — do NOT await; handler returns immediately
  void runJob(job.id, schedule.id)

  // 8. Return 202 immediately
  return NextResponse.json(
    { data: { jobId: job.id, status: 'queued' as const } },
    { status: 202 },
  )
}
