'use client'

import { useEffect, useState, useTransition } from 'react'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ───────────────────────────────────────────────────────────────────

type ParsedField<T> = T | { __raw: string; parseError: true }

interface ApiLogDetail {
  id: number
  logType: string | null
  message: string | null
  ip: string | null
  userAgent: string | null
  method: string | null
  url: string | null
  responseStatus: number | null
  responseBodyPreview: string | null
  durationMs: number | null
  isError: boolean
  errorType: string | null
  errorStack: string | null
  source: string | null
  environment: string | null
  dataKeys: ParsedField<string[]> | null
  responseHeaders: ParsedField<Record<string, string>> | null
  createdAt: string
  updatedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function methodBadgeClass(method: string | null): string {
  switch (method?.toUpperCase()) {
    case 'GET':    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    case 'POST':   return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    case 'PUT':
    case 'PATCH':  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
    case 'DELETE': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
    default:       return 'bg-muted text-muted-foreground'
  }
}

function statusBadgeClass(status: number | null): string {
  if (status === null) return 'bg-muted text-muted-foreground'
  if (status >= 500) return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
  if (status >= 400) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
  if (status >= 300) return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
  if (status >= 200) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
  return 'bg-muted text-muted-foreground'
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-emerald-500" />
        : <Copy className="h-3.5 w-3.5" />
      }
    </button>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
      {children}
    </h3>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
      {children}
    </dl>
  )
}

function GridItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="text-xs text-foreground break-all">{value ?? '—'}</dd>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ApiLogDetailPanelProps {
  logId: number
}

export function ApiLogDetailPanel({ logId }: ApiLogDetailPanelProps) {
  const [log, setLog] = useState<ApiLogDetail | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [fetchStatus, setFetchStatus] = useState<number | null>(null)
  const [, startTransition] = useTransition()
  const [bodyExpanded, setBodyExpanded] = useState(false)
  const [uaExpanded, setUaExpanded] = useState(false)

  useEffect(() => {
    setLog(null)
    setFetchError(null)
    setFetchStatus(null)

    const controller = new AbortController()

    startTransition(async () => {
      try {
        const res = await fetch(`/api/api-logs/${logId}`, { signal: controller.signal })
        setFetchStatus(res.status)
        const json = await res.json()
        if (!res.ok) {
          setFetchError(json.error?.message ?? 'Failed to load log')
          toast.error(json.error?.message ?? 'Failed to load log')
          return
        }
        setLog(json.data)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const msg = err instanceof Error ? err.message : 'Network error'
        setFetchError(msg)
        toast.error(msg)
      }
    })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logId])

  // ── Error states ────────────────────────────────────────────────────────────
  if (fetchStatus === 403) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
        <p className="text-sm text-muted-foreground">You don't have permission to view this log.</p>
      </div>
    )
  }
  if (fetchStatus === 404) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
        <p className="text-sm text-muted-foreground">This log no longer exists.</p>
      </div>
    )
  }
  if (fetchError && !log) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
        <p className="text-sm text-destructive">{fetchError}</p>
      </div>
    )
  }

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (!log) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-1/4" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  const bodyPreviewText = log.responseBodyPreview ?? ''
  const BODY_LIMIT = 4000
  const bodyTruncated = bodyPreviewText.length > BODY_LIMIT
  const displayBody = bodyExpanded ? bodyPreviewText : bodyPreviewText.slice(0, BODY_LIMIT)

  const uaText = log.userAgent ?? ''
  const UA_LIMIT = 120
  const uaTruncated = uaText.length > UA_LIMIT

  const hasError = log.isError || !!log.errorStack || !!log.errorType

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto">

      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* Method + URL */}
        <div className="flex items-start gap-2 flex-wrap">
          {log.method && (
            <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold font-mono uppercase shrink-0 ${methodBadgeClass(log.method)}`}>
              {log.method}
            </span>
          )}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <code className="text-sm font-mono text-foreground break-all select-all flex-1">
              {log.url ?? '—'}
            </code>
            {log.url && <CopyButton text={log.url} />}
          </div>
        </div>

        {/* Status + Duration */}
        <div className="flex items-center gap-3 flex-wrap">
          {log.responseStatus !== null && (
            <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold tabular-nums ${statusBadgeClass(log.responseStatus)}`}>
              {log.responseStatus}
            </span>
          )}
          {log.durationMs !== null && (
            <span className="text-xs text-muted-foreground tabular-nums">{log.durationMs} ms</span>
          )}
        </div>

        {/* Timestamp */}
        <p className="text-xs text-muted-foreground">
          <span title={log.createdAt}>{new Date(log.createdAt).toLocaleString()}</span>
          <span className="ml-1 opacity-60">({relativeTime(log.createdAt)})</span>
        </p>

        {/* Error indicator */}
        {hasError && (
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
            <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
              {log.errorType ?? 'Error'}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* ── 2. Summary grid ───────────────────────────────────────────────── */}
      <div>
        <SectionHeading>Details</SectionHeading>
        <Grid2>
          <GridItem label="ID" value={String(log.id)} />
          <GridItem label="Log Type" value={log.logType} />
          <GridItem label="Source" value={log.source} />
          <GridItem label="Environment" value={log.environment} />
          <GridItem label="IP" value={
            log.ip ? (
              <span className="font-mono">{log.ip}</span>
            ) : null
          } />
          <GridItem label="Message" value={log.message} />
          <div className="sm:col-span-2">
            <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">User Agent</dt>
            <dd className="text-xs text-foreground break-all">
              {uaTruncated && !uaExpanded
                ? (
                  <>
                    {uaText.slice(0, UA_LIMIT)}…{' '}
                    <button
                      type="button"
                      onClick={() => setUaExpanded(true)}
                      className="text-accent-foreground underline"
                    >
                      show all
                    </button>
                  </>
                )
                : (uaText || '—')}
            </dd>
          </div>
        </Grid2>
      </div>

      <div className="border-t border-border" />

      {/* ── 3. Request data keys ──────────────────────────────────────────── */}
      <div>
        <SectionHeading>Request Data Keys</SectionHeading>
        {log.dataKeys === null ? (
          <p className="text-xs text-muted-foreground">No data keys recorded.</p>
        ) : 'parseError' in log.dataKeys ? (
          <pre className="rounded-md bg-muted px-3 py-2 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
            {log.dataKeys.__raw}
          </pre>
        ) : log.dataKeys.length === 0 ? (
          <p className="text-xs text-muted-foreground">Empty body / no keys.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {log.dataKeys.map((k) => (
              <span
                key={k}
                className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-foreground"
              >
                {k}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* ── 4. Response ───────────────────────────────────────────────────── */}
      <div>
        <SectionHeading>Response</SectionHeading>
        <div className="flex flex-col gap-4">
          {/* Status re-stated */}
          {log.responseStatus !== null && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Status</p>
              <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold tabular-nums ${statusBadgeClass(log.responseStatus)}`}>
                {log.responseStatus}
              </span>
            </div>
          )}

          {/* Response headers */}
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Headers</p>
            {log.responseHeaders === null ? (
              <p className="text-xs text-muted-foreground">No headers recorded.</p>
            ) : 'parseError' in log.responseHeaders ? (
              <pre className="rounded-md bg-muted px-3 py-2 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                {log.responseHeaders.__raw}
              </pre>
            ) : Object.keys(log.responseHeaders).length === 0 ? (
              <p className="text-xs text-muted-foreground">No headers.</p>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(log.responseHeaders).map(([k, v]) => (
                      <tr key={k} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 font-mono text-muted-foreground w-1/3 break-all align-top">{k}</td>
                        <td className="px-3 py-1.5 font-mono text-foreground break-all">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Response body preview */}
          {bodyPreviewText && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Body Preview</p>
                <CopyButton text={bodyPreviewText} />
              </div>
              <pre className="rounded-md bg-muted px-3 py-2 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                {displayBody}
                {bodyTruncated && !bodyExpanded && '…'}
              </pre>
              {bodyTruncated && (
                <button
                  type="button"
                  onClick={() => setBodyExpanded((p) => !p)}
                  className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {bodyExpanded
                    ? <><ChevronUp className="h-3 w-3" /> Show less</>
                    : <><ChevronDown className="h-3 w-3" /> Show all ({bodyPreviewText.length} chars)</>
                  }
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Error details ──────────────────────────────────────────────── */}
      {hasError && (
        <>
          <div className="border-t border-border" />
          <div>
            <SectionHeading>Error Details</SectionHeading>
            <div className="flex flex-col gap-3">
              {log.errorType && (
                <p className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-400 font-medium w-fit">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                  {log.errorType}
                </p>
              )}
              {log.errorStack && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Stack Trace</p>
                    <CopyButton text={log.errorStack} />
                  </div>
                  <pre className="rounded-md bg-muted border border-border px-3 py-2 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre max-h-64 overflow-y-auto leading-relaxed">
                    {log.errorStack}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="border-t border-border" />

      {/* ── 6. Footer ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <p className="text-[10px] text-muted-foreground">
          Created: <span className="font-mono">{new Date(log.createdAt).toISOString()}</span>
        </p>
        <p className="text-[10px] text-muted-foreground">
          Updated: <span className="font-mono">{new Date(log.updatedAt).toISOString()}</span>
        </p>
      </div>
    </div>
  )
}
