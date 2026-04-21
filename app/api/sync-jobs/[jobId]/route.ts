import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { syncJobs } from '@/lib/db/schema/cron-sync'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

// ─── GET /api/sync-jobs/[jobId] ───────────────────────────────────────────────
//
// Progress polling endpoint. Intended to be called every ~1000 ms by the
// Run-progress modal until status is 'ok' or 'failed'.
//
// No deletedAt filter — sync_jobs rows are never soft-deleted (log-style table).

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  // 1. Session
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. CASL — read SyncSchedule covers job polling (cross-tenant scoping out of scope for this release)
  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'SyncSchedule')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Coerce + validate jobId
  const { jobId } = await params
  const numId = Number(jobId)
  if (!Number.isFinite(numId)) {
    return NextResponse.json(
      { error: { message: 'Invalid jobId', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Fetch job
  const [job] = await db
    .select({
      id:              syncJobs.id,
      status:          syncJobs.status,
      progress:        syncJobs.progress,
      recordsSeen:     syncJobs.recordsSeen,
      recordsUpserted: syncJobs.recordsUpserted,
      error:           syncJobs.error,
      startedAt:       syncJobs.startedAt,
      finishedAt:      syncJobs.finishedAt,
    })
    .from(syncJobs)
    .where(eq(syncJobs.id, numId))
    .limit(1)

  if (!job) {
    return NextResponse.json(
      { error: { message: 'Job not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  return NextResponse.json({ data: job })
}
