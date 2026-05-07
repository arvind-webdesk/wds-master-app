/**
 * Sync worker — dispatches a sync_jobs row to the real Shopify / BigCommerce
 * client for the requested target (products | orders | customers).
 *
 * Flow:
 *   1. Load the job + connection.
 *   2. Decrypt credentials (AES-GCM — see lib/crypto/encryption.ts).
 *   3. Pick the platform×target sync function and stream progress into sync_jobs
 *      via `onProgress`.
 *   4. On completion — terminal status + finaliseJob() to append sync_runs row.
 *
 * `runJob` is fire-and-forget: callers invoke it as `void runJob(id, scheduleId)`
 * from the API route and return 202 immediately. Failures NEVER throw back to the
 * caller; they are captured in `sync_jobs.error` and surfaced via sync-history.
 */

import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { syncJobs, syncSchedules } from '@/lib/db/schema/cron-sync'
import { syncRuns } from '@/lib/db/schema/integrations'
import { connections } from '@/lib/db/schema/connections'
import { decryptJson } from '@/lib/crypto/encryption'
import {
  syncShopifyProducts,
  syncShopifyOrders,
  syncShopifyCustomers,
} from '@/lib/cron-sync/platforms/shopify'
import {
  syncBigCommerceProducts,
  syncBigCommerceOrders,
  syncBigCommerceCustomers,
} from '@/lib/cron-sync/platforms/bigcommerce'

// ─── Credential shapes ──────────────────────────────────────────────────────

interface ShopifyCredentials {
  accessToken: string
  scope:       string
  installedAt: string
}

interface BigCommerceCredentials {
  storeHash:    string
  accessToken:  string
  clientId:     string
  clientSecret?: string
}

// ─── Progress throttling ────────────────────────────────────────────────────
// Keeps UI updates smooth without one DB round-trip per row.
const PROGRESS_INTERVAL_MS = 500

function makeProgressWriter(jobId: number) {
  let last = 0
  return async function writeProgress(seen: number, upserted: number) {
    const now = Date.now()
    if (now - last < PROGRESS_INTERVAL_MS) return
    last = now
    await db
      .update(syncJobs)
      .set({
        progress:        seen > 0 ? 50 : 1, // real totals are unknown; stay under 100 until finish
        recordsSeen:     seen,
        recordsUpserted: upserted,
      })
      .where(eq(syncJobs.id, jobId))
  }
}

// ─── Finalise — audit row + schedule bump ───────────────────────────────────

async function finaliseJob(jobId: number, scheduleId: number | null): Promise<void> {
  const [job] = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.id, jobId))
    .limit(1)

  if (!job) return

  const [conn] = await db
    .select({ platform: connections.type })
    .from(connections)
    .where(eq(connections.id, job.connectionId))
    .limit(1)

  const platform = conn?.platform ?? 'unknown'

  await db.insert(syncRuns).values({
    connectionId:    job.connectionId,
    platform,
    target:          job.target,
    status:          job.status,
    recordsSeen:     job.recordsSeen,
    recordsUpserted: job.recordsUpserted,
    error:           job.error ?? null,
    triggeredBy:     job.triggeredBy ?? null,
    startedAt:       job.startedAt,
    finishedAt:      job.finishedAt ?? new Date().toISOString(),
  })

  if (scheduleId !== null) {
    await db
      .update(syncSchedules)
      .set({ lastRunAt: job.finishedAt ?? new Date().toISOString() })
      .where(and(eq(syncSchedules.id, scheduleId), isNull(syncSchedules.deletedAt)))
  }
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

type SyncTarget = 'products' | 'orders' | 'customers'
type SyncResult = { seen: number; upserted: number }

async function runShopify(
  target: SyncTarget,
  connectionId: number,
  shop: string,
  accessToken: string,
  onProgress: (seen: number, upserted: number) => Promise<void>,
): Promise<SyncResult> {
  const args = { connectionId, shop, accessToken, onProgress }
  switch (target) {
    case 'products':  return syncShopifyProducts(args)
    case 'orders':    return syncShopifyOrders(args)
    case 'customers': return syncShopifyCustomers(args)
  }
}

async function runBigCommerce(
  target: SyncTarget,
  connectionId: number,
  storeHash: string,
  accessToken: string,
  onProgress: (seen: number, upserted: number) => Promise<void>,
): Promise<SyncResult> {
  const args = { connectionId, storeHash, accessToken, onProgress }
  switch (target) {
    case 'products':  return syncBigCommerceProducts(args)
    case 'orders':    return syncBigCommerceOrders(args)
    case 'customers': return syncBigCommerceCustomers(args)
  }
}

// ─── Main entrypoint ────────────────────────────────────────────────────────

export async function runJob(jobId: number, scheduleId: number | null): Promise<void> {
  const startedAt = new Date().toISOString()
  try {
    // Flip to running
    await db
      .update(syncJobs)
      .set({ status: 'running', progress: 1, startedAt })
      .where(eq(syncJobs.id, jobId))

    // Load job + connection in parallel
    const [job] = await db.select().from(syncJobs).where(eq(syncJobs.id, jobId)).limit(1)
    if (!job) throw new Error(`Job ${jobId} not found`)

    const [conn] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, job.connectionId), isNull(connections.deletedAt)))
      .limit(1)
    if (!conn) throw new Error(`Connection ${job.connectionId} not found or deleted`)
    if (!conn.credentials) throw new Error('Connection has no credentials stored')

    const target = job.target as SyncTarget
    if (target !== 'products' && target !== 'orders' && target !== 'customers') {
      throw new Error(`Unknown sync target: ${target}`)
    }

    const onProgress = makeProgressWriter(jobId)
    let result: SyncResult

    if (conn.type === 'shopify') {
      const creds = decryptJson<ShopifyCredentials>(conn.credentials)
      if (!creds.accessToken) throw new Error('Shopify credentials missing accessToken')
      result = await runShopify(target, job.connectionId, conn.storeIdentifier, creds.accessToken, onProgress)
    } else if (conn.type === 'bigcommerce') {
      const creds = decryptJson<BigCommerceCredentials>(conn.credentials)
      if (!creds.accessToken || !creds.storeHash) {
        throw new Error('BigCommerce credentials missing accessToken or storeHash')
      }
      result = await runBigCommerce(target, job.connectionId, creds.storeHash, creds.accessToken, onProgress)
    } else {
      throw new Error(`Unsupported connection type: ${conn.type}`)
    }

    // Success — write terminal state
    const finishedAt = new Date().toISOString()
    await db
      .update(syncJobs)
      .set({
        status:          'ok',
        progress:        100,
        recordsSeen:     result.seen,
        recordsUpserted: result.upserted,
        finishedAt,
      })
      .where(eq(syncJobs.id, jobId))

    await finaliseJob(jobId, scheduleId)
  } catch (err: unknown) {
    const finishedAt = new Date().toISOString()
    const message = err instanceof Error ? err.message : String(err)
    console.error('[run-job] failed for jobId', jobId, message)
    await db
      .update(syncJobs)
      .set({
        status:     'failed',
        error:      message,
        finishedAt,
      })
      .where(eq(syncJobs.id, jobId))
    await finaliseJob(jobId, scheduleId).catch(() => undefined)
  }
}
