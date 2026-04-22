'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  ExternalLink,
  KeyRound,
  Loader2,
  Pencil,
  Plug,
  RefreshCw,
  RotateCcw,
  Store,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Zap,
} from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { toast } from 'sonner'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAbility } from '@/lib/acl/ability-context'
import { ConnectionTypeBadge } from '@/components/connections/connection-type-badge'
import { ConnectionStatusBadge } from '@/components/connections/connection-status-badge'
import { ConnectionsSheet } from '@/components/connections/connections-sheet'
import type { SafeConnection } from '@/lib/db/schema/connections'
import { isIntegrationEnabled } from '@/lib/client-config'

// Onboarding-time platform gate. Deep-linking to a connection whose platform
// was turned off at onboarding should not render the management UI.
const SHOPIFY_ON     = isIntegrationEnabled('shopify')
const BIGCOMMERCE_ON = isIntegrationEnabled('bigcommerce')
function isPlatformEnabled(type: string): boolean {
  if (type === 'shopify')     return SHOPIFY_ON
  if (type === 'bigcommerce') return BIGCOMMERCE_ON
  return false
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DetailConnection extends SafeConnection {
  createdByUser?: {
    id: number
    email: string
    firstName: string | null
    lastName: string | null
  } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  try {
    return formatDistanceToNow(parseISO(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')), {
      addSuffix: true,
    })
  } catch {
    return iso
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  conn,
  onEditClick,
}: {
  conn: DetailConnection
  onEditClick: () => void
}) {
  const ability = useAbility()
  const canUpdate = ability.can('update', 'Connection')

  const fields: { label: string; value: React.ReactNode }[] = [
    { label: 'Name', value: conn.name },
    { label: 'Platform', value: <ConnectionTypeBadge type={conn.type as 'shopify' | 'bigcommerce'} /> },
    {
      label: 'Store identifier',
      value:
        conn.type === 'shopify' ? (
          <a
            href={`https://${conn.storeIdentifier}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
          >
            {conn.storeIdentifier}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="font-mono text-xs">{conn.storeIdentifier}</span>
        ),
    },
    { label: 'Status', value: <ConnectionStatusBadge status={conn.status as 'active' | 'disabled' | 'error'} /> },
    { label: 'Last sync', value: fmtRelative(conn.lastSyncAt) },
    {
      label: 'Created by',
      value: conn.createdByUser ? (
        <Link
          href={`/users/${conn.createdByUser.id}`}
          className="text-primary hover:underline"
        >
          {conn.createdByUser.firstName
            ? `${conn.createdByUser.firstName} ${conn.createdByUser.lastName ?? ''}`.trim()
            : conn.createdByUser.email}
        </Link>
      ) : (
        '—'
      ),
    },
    { label: 'Created at', value: fmtDate(conn.createdAt) },
    { label: 'Updated at', value: fmtDate(conn.updatedAt) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-[0.625rem]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Overview</CardTitle>
            {canUpdate && (
              <Button size="sm" variant="outline" onClick={onEditClick}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {fields.map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Credentials tab ──────────────────────────────────────────────────────────

function CredentialsTab({
  conn,
  onEditClick,
}: {
  conn: DetailConnection
  onEditClick: () => void
}) {
  return (
    <Card className="rounded-[0.625rem]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Credentials</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* hasCredentials */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Credentials stored</span>
          <span className="text-sm text-foreground font-medium">
            {conn.hasCredentials ? 'Yes' : 'No'}
          </span>
        </div>

        {/* Platform-specific metadata (non-secret fields) */}
        {conn.type === 'bigcommerce' && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Store hash</span>
            <span className="font-mono text-sm text-foreground">{conn.storeIdentifier}</span>
          </div>
        )}

        {conn.type === 'shopify' && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Shop domain</span>
            <span className="font-mono text-sm text-foreground">{conn.storeIdentifier}</span>
          </div>
        )}

        {/* Masked secret indicator */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Access token</span>
          <span className="font-mono text-sm text-muted-foreground">
            {conn.hasCredentials ? '••••••••••••••••' : '—'}
          </span>
        </div>

        <p className="text-xs text-muted-foreground border border-border rounded-md p-2 bg-muted/40">
          Decrypted secrets are write-only and are never exposed in the UI.
        </p>

        {/* Rotate button */}
        <div className="flex items-center gap-2 pt-1">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          {conn.type === 'shopify' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.location.href =
                  `/api/connections/shopify/install?shop=${encodeURIComponent(conn.storeIdentifier)}`
              }}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Rotate via OAuth
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onEditClick}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Rotate credentials
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sync runs tab ────────────────────────────────────────────────────────────

function SyncRunsTab() {
  return (
    <Card className="rounded-[0.625rem]">
      <CardContent className="flex flex-col items-center gap-3 py-12">
        <RefreshCw className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Sync runs</p>
        <p className="text-xs text-center text-muted-foreground max-w-xs">
          View the full sync run history for all connections in the Sync History module.
        </p>
        <Link
          href="/sync-history"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          See Sync History
          <ExternalLink className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  )
}

// ─── Schedules tab ────────────────────────────────────────────────────────────

function SchedulesTab({ connectionId }: { connectionId: number }) {
  return (
    <Card className="rounded-[0.625rem]">
      <CardContent className="flex flex-col items-center gap-3 py-12">
        <Clock className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No schedules configured</p>
        <p className="text-xs text-center text-muted-foreground max-w-xs">
          Set up automatic sync schedules for this connection in the Cron Sync module.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/cron-sync"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            View Cron Sync
            <ExternalLink className="h-3 w-3" />
          </Link>
          <span className="text-xs text-muted-foreground">·</span>
          <Link
            href={`/cron-sync/new?connectionId=${connectionId}`}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            Add schedule
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const VALID_TABS = ['overview', 'credentials', 'sync-runs', 'schedules'] as const
type Tab = (typeof VALID_TABS)[number]

export default function ConnectionDetailPage() {
  const ability = useAbility()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()

  const id = params.id as string

  const canUpdate = ability.can('update', 'Connection')
  const canDelete = ability.can('delete', 'Connection')

  const rawTab = searchParams.get('tab') as Tab | null
  const activeTab: Tab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'overview'

  const [conn, setConn] = useState<DetailConnection | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [deletePending, startDeleteTransition] = useTransition()

  function setTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`/connections/${id}?${params}`, { scroll: false })
  }

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/connections/${id}`)
      if (res.status === 404) {
        notFound()
        return
      }
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to load connection')
        return
      }
      setConn(json.data)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // OAuth return banner
  useEffect(() => {
    if (searchParams.get('connected') === '1') {
      toast.success('Connection established')
      const p = new URLSearchParams(searchParams.toString())
      p.delete('connected')
      router.replace(`/connections/${id}${p.size ? `?${p}` : ''}`)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleTest() {
    startTransition(async () => {
      const res = await fetch(`/api/connections/${id}/test`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Test failed')
        return
      }
      if (json.data?.ok) {
        toast.success('Connection is healthy')
      } else {
        toast.error(`Connection error: ${json.data?.error ?? 'Unknown error'}`)
      }
      load()
    })
  }

  function handleToggleStatus() {
    if (!conn) return
    const newStatus = conn.status === 'active' ? 'disabled' : 'active'
    startTransition(async () => {
      const res = await fetch(`/api/connections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to update status')
        return
      }
      toast.success(`Connection ${newStatus === 'active' ? 'enabled' : 'disabled'}`)
      load()
    })
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const res = await fetch(`/api/connections/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to delete')
        return
      }
      toast.success('Connection deleted')
      router.push('/connections')
    })
  }

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Card className="rounded-[0.625rem]">
          <CardContent className="pt-4 flex flex-col gap-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!conn) return null

  // Guard: the dashboard is locked to a specific platform at onboarding. If
  // this connection's platform isn't enabled (stale row, or the seed was
  // re-applied with a different platform), show a notice instead of the full
  // management UI.
  if (!isPlatformEnabled(conn.type)) {
    const label = conn.type === 'shopify' ? 'Shopify' : 'BigCommerce'
    return (
      <div className="flex flex-col gap-4 p-6">
        <Link
          href="/connections"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to connections
        </Link>
        <Card className="rounded-[0.625rem]">
          <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
            <Plug className="h-8 w-8 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                {label} is not enabled for this dashboard
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                This connection exists but its platform was disabled at onboarding.
                To manage {label} connections, re-run the onboarding apply step with{' '}
                {label} enabled.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Back nav */}
      <Link
        href="/connections"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to connections
      </Link>

      {/* Header card */}
      <Card className="rounded-[0.625rem]">
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            {/* Identity */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Plug className="h-5 w-5 text-muted-foreground shrink-0" />
                <h1 className="text-xl font-semibold text-foreground">{conn.name}</h1>
                <ConnectionTypeBadge type={conn.type as 'shopify' | 'bigcommerce'} />
                <ConnectionStatusBadge status={conn.status as 'active' | 'disabled' | 'error'} />
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                <Store className="h-3.5 w-3.5" />
                <span className="font-mono">{conn.storeIdentifier}</span>
                {conn.lastSyncAt && (
                  <>
                    <span className="text-border">·</span>
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span>Last sync {fmtRelative(conn.lastSyncAt)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {canUpdate && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSheetOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTest}
                    disabled={pending}
                  >
                    {pending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Test
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleToggleStatus}
                    disabled={pending}
                  >
                    {conn.status === 'active' ? (
                      <>
                        <ToggleLeft className="h-3.5 w-3.5 mr-1.5" />
                        Disable
                      </>
                    ) : (
                      <>
                        <ToggleRight className="h-3.5 w-3.5 mr-1.5" />
                        Enable
                      </>
                    )}
                  </Button>
                </>
              )}

              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button size="sm" variant="destructive" disabled={deletePending} />
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete connection</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete <strong>{conn.name}</strong>? This will
                        soft-delete the connection and disable it. Sync workers will stop using it.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={deletePending}
                      >
                        {deletePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="sync-runs">Sync runs</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab conn={conn} onEditClick={() => setSheetOpen(true)} />
        </TabsContent>

        <TabsContent value="credentials">
          <CredentialsTab conn={conn} onEditClick={() => setSheetOpen(true)} />
        </TabsContent>

        <TabsContent value="sync-runs">
          <SyncRunsTab />
        </TabsContent>

        <TabsContent value="schedules">
          <SchedulesTab connectionId={conn.id} />
        </TabsContent>
      </Tabs>

      {/* Edit sheet */}
      <ConnectionsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={load}
        mode="edit"
        connection={conn}
      />
    </div>
  )
}
