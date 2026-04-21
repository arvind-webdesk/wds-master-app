/**
 * STUB SYNC WORKER — DEV / PHASE 4 ONLY
 *
 * This is an in-process, fire-and-forget job runner. It simulates sync
 * progress with fake setTimeout delays and random data. It does NOT call any
 * real commerce-platform API.
 *
 * REPLACE IN PRODUCTION: swap `runJob` for a real worker that:
 *   1. Reads the `sync_jobs` row to get connectionId + target.
 *   2. Decrypts credentials from `integration_connections`.
 *   3. Pages through the Shopify / BigCommerce API, upserting rows into the
 *      relevant `integration_*` table after each page.
 *   4. Calls `finaliseJob()` (already defined below) when done — that part
 *      can stay.
 *
 * Until then, every "run" is purely cosmetic: fake counters increment,
 * status flips to 'ok' (or 20%-randomly to 'failed'), and a real `sync_runs`
 * audit row is inserted so Sync History stays consistent.
 */

import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { syncJobs } from '@/lib/db/schema/cron-sync'
import { syncSchedules } from '@/lib/db/schema/cron-sync'
import { syncRuns } from '@/lib/db/schema/integrations'
import { connections } from '@/lib/db/schema/connections'

const STEPS      = 10
const STEP_MS    = 500   // milliseconds between simulated pages

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Copies the terminal job state into `sync_runs` and (if scheduleId is given)
 * bumps `sync_schedules.lastRunAt`.
 */
async function finaliseJob(
  jobId: number,
  scheduleId: number | null,
): Promise<void> {
  const [job] = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.id, jobId))
    .limit(1)

  if (!job) return

  // Look up the platform from the connection row.
  const [conn] = await db
    .select({ platform: connections.type })
    .from(connections)
    .where(eq(connections.id, job.connectionId))
    .limit(1)

  const platform = conn?.platform ?? 'unknown'

  // Insert audit row.
  await db.insert(syncRuns).values({
    connectionId:     job.connectionId,
    platform,
    target:           job.target,
    status:           job.status,
    recordsSeen:      job.recordsSeen,
    recordsUpserted:  job.recordsUpserted,
    error:            job.error ?? null,
    triggeredBy:      job.triggeredBy ?? null,
    startedAt:        job.startedAt,
    finishedAt:       job.finishedAt ?? new Date().toISOString(),
  })

  // Bump schedule's lastRunAt if this was triggered from a schedule.
  if (scheduleId !== null) {
    await db
      .update(syncSchedules)
      .set({ lastRunAt: job.finishedAt ?? new Date().toISOString() })
      .where(and(eq(syncSchedules.id, scheduleId), isNull(syncSchedules.deletedAt)))
  }
}

/**
 * Main stub runner. Call fire-and-forget:
 *   void runJob(jobId, scheduleId)
 *
 * @param jobId      — the `sync_jobs.id` row to drive
 * @param scheduleId — `sync_schedules.id` when triggered from a named schedule;
 *                     null for ad-hoc runs
 */
export async function runJob(jobId: number, scheduleId: number | null): Promise<void> {
  try {
    // Flip to running.
    await db
      .update(syncJobs)
      .set({ status: 'running', progress: 1 })
      .where(eq(syncJobs.id, jobId))

    let recordsSeen      = 0
    let recordsUpserted  = 0

    for (let step = 1; step <= STEPS; step++) {
      await sleep(STEP_MS)

      // 20% random failure on step 5.
      if (step === 5 && Math.random() < 0.2) {
        const finishedAt = new Date().toISOString()
        await db.update(syncJobs).set({
          status:     'failed',
          error:      'Simulated sync failure',
          progress:   Math.round((step / STEPS) * 100),
          recordsSeen,
          recordsUpserted,
          finishedAt,
        }).where(eq(syncJobs.id, jobId))

        await finaliseJob(jobId, scheduleId)
        return
      }

      const newSeen      = recordsSeen + randomBetween(5, 25)
      const newUpserted  = Math.round(newSeen * 0.8)
      const progress     = step === STEPS ? 100 : Math.round((step / STEPS) * 100)

      recordsSeen     = newSeen
      recordsUpserted = newUpserted

      await db.update(syncJobs).set({
        progress,
        recordsSeen,
        recordsUpserted,
      }).where(eq(syncJobs.id, jobId))
    }

    // All steps completed — success.
    const finishedAt = new Date().toISOString()
    await db.update(syncJobs).set({
      status:     'ok',
      progress:   100,
      recordsSeen,
      recordsUpserted,
      finishedAt,
    }).where(eq(syncJobs.id, jobId))

    await finaliseJob(jobId, scheduleId)
  } catch (err: unknown) {
    // Last-resort failure path so the row never stays stuck in 'running'.
    const finishedAt = new Date().toISOString()
    const message = err instanceof Error ? err.message : String(err)
    console.error('[run-job] unexpected error for jobId', jobId, message)
    await db.update(syncJobs).set({
      status:    'failed',
      error:     message,
      finishedAt,
    }).where(eq(syncJobs.id, jobId))

    await finaliseJob(jobId, scheduleId).catch(() => undefined)
  }
}
