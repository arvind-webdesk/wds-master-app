'use client'

import { useState } from 'react'
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { relativeTime, formatDuration } from './sync-history-columns'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncRunDetail {
  id: number
  platform: string
  target: string
  status: string
  recordsSeen: number
  recordsUpserted: number
  error: string | null
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  connectionId: number | null
  connectionName: string | null
  triggeredBy: number | null
  triggeredByLabel: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtAbsolute(iso: string): string {
  try {
    return format(parseISO(iso.replace(' ', 'T')), 'PPpp')
  } catch {
    return iso
  }
}

function fmtRelative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso.replace(' ', 'T')), { addSuffix: true })
  } catch {
    return relativeTime(iso)
  }
}

function platformBadgeCls(p: string) {
  switch (p.toLowerCase()) {
    case 'shopify':     return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    case 'bigcommerce': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
    default:            return 'bg-muted text-muted-foreground'
  }
}

function platformLabel(p: string) {
  switch (p.toLowerCase()) {
    case 'shopify':     return 'Shopify'
    case 'bigcommerce': return 'BigCommerce'
    default:            return p
  }
}

function statusBadgeCls(s: string) {
  switch (s) {
    case 'ok':      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    case 'failed':  return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
    case 'running': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
    default:        return 'bg-muted text-muted-foreground'
  }
}

function statusLabel(s: string) {
  if (s === 'ok') return 'OK'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function GridRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs text-muted-foreground font-medium">{label}</dt>
      <dd className="text-xs text-foreground">{value}</dd>
    </>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={handleCopy}
      title="Copy"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-emerald-600" />
        : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
    </Button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface SyncRunDetailProps {
  run: SyncRunDetail
}

export function SyncRunDetailView({ run }: SyncRunDetailProps) {
  const hasError = !!run.error

  const upsertRatio =
    run.recordsSeen > 0
      ? `${Math.round((run.recordsUpserted / run.recordsSeen) * 100)}%`
      : '—'

  return (
    <div className="flex flex-col gap-6">

      {/* ── 1. Header card ─────────────────────────────────────────────────── */}
      <div className="rounded-[0.625rem] border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${platformBadgeCls(run.platform)}`}>
            {platformLabel(run.platform)}
          </span>
          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs capitalize bg-muted text-muted-foreground">
            {run.target}
          </span>
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${statusBadgeCls(run.status)}`}>
            {run.status === 'running' && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            )}
            {statusLabel(run.status)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Started */}
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Started</p>
            <p className="text-sm font-medium text-foreground" title={run.startedAt}>
              {fmtAbsolute(run.startedAt)}
            </p>
            <p className="text-xs text-muted-foreground">{fmtRelative(run.startedAt)}</p>
          </div>

          {/* Finished */}
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Finished</p>
            {run.finishedAt ? (
              <>
                <p className="text-sm font-medium text-foreground" title={run.finishedAt}>
                  {fmtAbsolute(run.finishedAt)}
                </p>
                <p className="text-xs text-muted-foreground">{fmtRelative(run.finishedAt)}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">—</p>
                <p className="text-xs text-amber-600">(still running)</p>
              </>
            )}
          </div>

          {/* Duration */}
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Duration</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {formatDuration(run.durationMs)}
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Summary grid ────────────────────────────────────────────────── */}
      <div className="rounded-[0.625rem] border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <GridRow label="Run ID" value={`#${run.id}`} />
          <GridRow
            label="Connection"
            value={
              run.connectionName
                ? <span>{run.connectionName} <span className="text-muted-foreground">({run.connectionId})</span></span>
                : <span className="text-muted-foreground">(legacy)</span>
            }
          />
          <GridRow
            label="Triggered by"
            value={
              run.triggeredByLabel
                ? <span>{run.triggeredByLabel} <span className="text-muted-foreground">({run.triggeredBy})</span></span>
                : <span className="text-muted-foreground">System</span>
            }
          />
          <GridRow label="Records seen" value={run.recordsSeen.toLocaleString()} />
          <GridRow label="Records upserted" value={run.recordsUpserted.toLocaleString()} />
          <GridRow label="Upsert ratio" value={upsertRatio} />
        </dl>
      </div>

      {/* ── 3. Error details ───────────────────────────────────────────────── */}
      {hasError && (
        <div className="rounded-[0.625rem] border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Error</h2>
            <CopyButton text={run.error!} />
          </div>
          <div className="max-h-[480px] overflow-auto rounded-md bg-card border border-border">
            <pre className="p-4 text-xs font-mono whitespace-pre text-foreground leading-relaxed">
              {run.error}
            </pre>
          </div>
        </div>
      )}

      {/* ── 4. Footer ──────────────────────────────────────────────────────── */}
      <div className="rounded-[0.625rem] border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Timestamps</h2>
        <dl className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-xs text-muted-foreground">Started at (ISO)</dt>
            <dd className="flex items-center gap-1">
              <span className="text-xs font-mono text-foreground">{run.startedAt}</span>
              <CopyButton text={run.startedAt} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-xs text-muted-foreground">Finished at (ISO)</dt>
            <dd className="flex items-center gap-1">
              <span className="text-xs font-mono text-foreground">{run.finishedAt ?? '—'}</span>
              {run.finishedAt && <CopyButton text={run.finishedAt} />}
            </dd>
          </div>
        </dl>
      </div>

    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

export function SyncRunDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[0.625rem] border border-border bg-card p-5">
        <div className="flex gap-2 mb-4">
          <Skeleton className="h-6 w-20 rounded" />
          <Skeleton className="h-6 w-16 rounded" />
          <Skeleton className="h-6 w-16 rounded" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5"><Skeleton className="h-4 w-16" /><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-20" /></div>
          <div className="space-y-1.5"><Skeleton className="h-4 w-16" /><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-20" /></div>
          <div className="space-y-1.5"><Skeleton className="h-4 w-16" /><Skeleton className="h-8 w-24" /></div>
        </div>
      </div>
      <div className="rounded-[0.625rem] border border-border bg-card p-5">
        <Skeleton className="h-4 w-20 mb-4" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      </div>
    </div>
  )
}
