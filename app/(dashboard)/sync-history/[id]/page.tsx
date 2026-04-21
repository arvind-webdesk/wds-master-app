import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, History } from 'lucide-react'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { db } from '@/lib/db/client'
import { syncRuns } from '@/lib/db/schema/integrations'
import { users } from '@/lib/db/schema/users'
import { connections } from '@/lib/db/schema/connections'
import { eq } from 'drizzle-orm'
import { SyncRunDetailView } from '@/components/sync-history/SyncRunDetail'
import type { SyncRunDetail } from '@/components/sync-history/SyncRunDetail'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}

export default async function SyncRunDetailPage({ params, searchParams }: PageProps) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const user = await getSessionUser()
  if (!user) redirect('/login')

  // ── ACL ─────────────────────────────────────────────────────────────────────
  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'SyncRun')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-6">
        <History className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          You don&apos;t have permission to view sync history.
        </p>
      </div>
    )
  }

  // ── Resolve params ──────────────────────────────────────────────────────────
  const { id: idRaw }  = await params
  const { from }       = await searchParams
  const id             = parseInt(idRaw, 10)

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-6">
        <p className="text-sm text-muted-foreground">Invalid sync run ID.</p>
        <Link
          href="/sync-history"
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Back to Sync History
        </Link>
      </div>
    )
  }

  const backHref = from ?? '/sync-history'

  // ── Fetch data ──────────────────────────────────────────────────────────────
  let run: SyncRunDetail | null = null
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
        startedAt:        syncRuns.startedAt,
        finishedAt:       syncRuns.finishedAt,
        connectionId:     syncRuns.connectionId,
        triggeredBy:      syncRuns.triggeredBy,
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

    if (row) {
      const durationMs =
        row.finishedAt && row.startedAt
          ? Math.max(0, Date.parse(row.finishedAt) - Date.parse(row.startedAt))
          : null

      const triggeredByLabel = row.triggeredByFirst
        ? `${row.triggeredByFirst} ${row.triggeredByLast ?? ''}`.trim() || (row.triggeredByEmail ?? null)
        : null

      run = {
        id:               row.id,
        platform:         row.platform,
        target:           row.target,
        status:           row.status,
        recordsSeen:      row.recordsSeen,
        recordsUpserted:  row.recordsUpserted,
        error:            row.error             ?? null,
        startedAt:        row.startedAt,
        finishedAt:       row.finishedAt        ?? null,
        durationMs,
        connectionId:     row.connectionId      ?? null,
        connectionName:   row.connectionName    ?? null,
        triggeredBy:      row.triggeredBy       ?? null,
        triggeredByLabel: triggeredByLabel      ?? null,
      }
    }
  } catch (err) {
    console.error('[sync-history/[id] page] query failed', err)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-6">
        <p className="text-sm text-muted-foreground">Failed to load this sync run.</p>
        <Link href={backHref} className="text-xs text-muted-foreground hover:text-foreground underline">
          Back to Sync History
        </Link>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-6">
        <History className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">This sync run no longer exists.</p>
        <Link href={backHref} className="text-xs text-muted-foreground hover:text-foreground underline">
          Back to Sync History
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0 max-w-3xl mx-auto p-6">
      {/* Back button */}
      <div className="mb-5">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors -ml-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sync History
        </Link>
      </div>

      {/* Page title */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">Sync Run #{run.id}</h1>
        <p className="text-sm text-muted-foreground">Full details for this sync attempt.</p>
      </div>

      {/* Detail panel */}
      <SyncRunDetailView run={run} />
    </div>
  )
}
