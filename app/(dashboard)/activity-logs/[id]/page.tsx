'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAbility } from '@/lib/acl/ability-context'
import type { ActivityLogRow } from '@/components/activity-logs/activity-logs-columns'
import Link from 'next/link'

// ─── Subject slug map (for linking to known entity detail pages) ──────────────

const SUBJECT_SLUG_MAP: Record<string, string> = {
  User: 'users',
  Role: 'roles',
  EmailTemplate: 'email-templates',
  Setting: 'settings',
}

// ─── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 py-2.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground font-medium pt-0.5">{label}</span>
      <span className="text-xs text-foreground break-all">{value ?? '—'}</span>
    </div>
  )
}

// ─── JSON meta panel ──────────────────────────────────────────────────────────

function MetaPanel({ raw }: { raw: string | null }) {
  const [open, setOpen] = useState(false)
  const [, startCopy] = useTransition()

  if (!raw) {
    return (
      <Card className="rounded-[0.625rem] border-border shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Meta payload</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No meta payload recorded.</p>
        </CardContent>
      </Card>
    )
  }

  let parsed: unknown
  let prettyJson: string
  try {
    parsed = JSON.parse(raw)
    prettyJson = JSON.stringify(parsed, null, 2)
  } catch {
    prettyJson = raw
  }

  function handleCopy() {
    startCopy(async () => {
      try {
        await navigator.clipboard.writeText(prettyJson)
        toast.success('Copied to clipboard')
      } catch {
        toast.error('Copy failed')
      }
    })
  }

  return (
    <Card className="rounded-[0.625rem] border-border shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Meta payload</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3" />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Expand
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
            {prettyJson}
          </pre>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityLogDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const ability = useAbility()

  const canRead = ability.can('read', 'ActivityLog')

  const [log, setLog] = useState<ActivityLogRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFoundState, setNotFoundState] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/activity-logs/${params.id}`)
      if (res.status === 404) {
        setNotFoundState(true)
        return
      }
      const json = await res.json()
      if (res.ok) {
        setLog(json.data)
      } else {
        toast.error(json.error?.message ?? 'Failed to load activity log')
      }
    } catch {
      toast.error('Network error — could not load activity log')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    if (canRead) load()
  }, [canRead, load])

  // ── Not found ──
  if (notFoundState) {
    notFound()
  }

  // ── CASL blocked ──
  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          You do not have permission to view activity logs.
        </p>
      </div>
    )
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-5 w-32" />
        <Card className="rounded-[0.625rem] border-border shadow-none">
          <CardContent className="p-6 flex flex-col gap-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!log) return null

  // ── Derive display values ──
  const actorName = log.user
    ? `${log.user.firstName} ${log.user.lastName}`
    : 'System'

  const subjectSlug = SUBJECT_SLUG_MAP[log.subjectType] ?? null
  const subjectLink =
    subjectSlug && log.subjectId != null
      ? `/${subjectSlug}/${log.subjectId}`
      : null

  const absTimestamp = new Date(log.createdAt).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back nav */}
      <button
        onClick={() => router.push('/activity-logs')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to activity logs
      </button>

      {/* Header card */}
      <Card className="rounded-[0.625rem] border-border shadow-none">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3">
            {/* Action badge */}
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-sm font-mono text-foreground">
                {log.action}
              </code>
              {log.subjectType !== 'System' && (
                <>
                  <Badge variant="outline" className="font-mono">
                    {log.subjectType}
                  </Badge>
                  {log.subjectId != null && (
                    subjectLink ? (
                      <Link
                        href={subjectLink}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        #{log.subjectId}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">#{log.subjectId}</span>
                    )
                  )}
                </>
              )}
            </div>

            {/* Timestamp + actor */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted-foreground" title={absTimestamp}>
                {absTimestamp} ({relativeTime(log.createdAt)})
              </span>
              <span className="text-muted-foreground">by</span>
              {log.user ? (
                <Link
                  href={`/users/${log.user.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {actorName}
                  <span className="ml-1.5 text-muted-foreground font-normal">
                    ({log.user.email})
                  </span>
                </Link>
              ) : (
                <span className="italic text-muted-foreground">System</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metadata grid */}
      <Card className="rounded-[0.625rem] border-border shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Details</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-4">
          <InfoRow label="ID" value={log.id} />
          <InfoRow
            label="When"
            value={`${absTimestamp} — ${relativeTime(log.createdAt)}`}
          />
          <InfoRow
            label="Actor"
            value={
              log.user ? (
                <Link
                  href={`/users/${log.user.id}`}
                  className="hover:underline text-foreground"
                >
                  {actorName} ({log.user.email})
                </Link>
              ) : (
                <span className="italic text-muted-foreground">System</span>
              )
            }
          />
          <InfoRow label="Action" value={
            <code className="font-mono">{log.action}</code>
          } />
          <InfoRow label="Subject type" value={log.subjectType} />
          <InfoRow
            label="Subject ID"
            value={
              log.subjectId != null
                ? subjectLink
                  ? <Link href={subjectLink} className="hover:underline text-foreground">{log.subjectId}</Link>
                  : log.subjectId
                : '—'
            }
          />
          <InfoRow
            label="IP"
            value={
              log.ip ? (
                <code className="font-mono">{log.ip}</code>
              ) : '—'
            }
          />
          <InfoRow
            label="User agent"
            value={log.userAgent ?? '—'}
          />
        </CardContent>
      </Card>

      {/* Meta payload */}
      <MetaPanel raw={log.meta} />
    </div>
  )
}
