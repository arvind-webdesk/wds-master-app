'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import {
  ShoppingCart, DollarSign, Package, Users as UsersIcon,
  RefreshCw, AlertCircle, CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  CartesianGrid, ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { MiddlewarePlatform } from '@/lib/analytics/dashboard-view'
import { getPlatformMeta } from '@/lib/analytics/platform-meta'

const ALL_STORES = 'all' as const

interface ConnectionSummary {
  id: number
  name: string
  storeIdentifier: string
  status: string
}

interface CommerceKpis {
  totalOrders: number
  totalProducts: number
  totalCustomers: number
  newCustomersWindow: number
  ordersWindow: number
  revenueWindow: number
}

interface SyncStatusRow {
  target: string
  status: string
  startedAt: string
  finishedAt: string | null
  recordsUpserted: number
  error: string | null
}

interface TopProductRow {
  id: number
  title: string | null
  sku: string | null
  price: string | null
  currency: string | null
  status: string | null
  syncedAt: string
}

interface CommerceData {
  platform: MiddlewarePlatform
  currency: string
  kpis: CommerceKpis
  ordersSeries: { day: string; total: number }[]
  revenueSeries: { day: string; total: number }[]
  statusBreakdown: { status: string; total: number }[]
  topProducts: TopProductRow[]
  lastSync: SyncStatusRow[]
}

const STATUS_COLORS = [
  'oklch(0.65 0.17 150)',
  'oklch(0.65 0.15 230)',
  'oklch(0.75 0.15 80)',
  'oklch(0.60 0.20 300)',
  'oklch(0.60 0.22 25)',
  'oklch(0.70 0 0)',
]

function fmtDay(iso: string) {
  try {
    return format(parseISO(iso), 'MMM d')
  } catch {
    return iso
  }
}

function fmtRelative(raw: string | null) {
  if (!raw) return '—'
  try {
    const date = parseISO(raw.replace(' ', 'T') + 'Z')
    return formatDistanceToNow(date, { addSuffix: true })
  } catch {
    return raw
  }
}

function fmtMoney(amount: number, currency: string) {
  try {
    // Use a fixed locale ('en-US') so the server-side render and the client
    // produce the same string — Intl.NumberFormat(undefined) picks up the
    // runtime locale which differs between Node.js and the browser and causes
    // a React hydration mismatch (e.g. "$0.00" on server vs "US$0.00" on client).
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  }
}

function syncStatusBadge(status: string) {
  switch (status) {
    case 'ok':      return { icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30' }
    case 'failed':  return { icon: XCircle,      cls: 'text-destructive bg-destructive/10' }
    case 'running': return { icon: Clock,        cls: 'text-sky-700 bg-sky-50 dark:bg-sky-950/30' }
    default:        return { icon: Clock,        cls: 'text-muted-foreground bg-muted' }
  }
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  isLoading,
}: {
  label: string
  value: number | string
  helper: string
  icon: React.ElementType
  isLoading: boolean
}) {
  return (
    <Card role="group" aria-label={label} className="rounded-[0.625rem]">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-24 mb-1" />
            <Skeleton className="h-3.5 w-32" />
          </>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
            <p className="text-xs mt-1 text-muted-foreground">{helper}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function CommerceDashboard({ platform }: { platform: MiddlewarePlatform }) {
  const meta = getPlatformMeta(platform)
  const [data, setData] = useState<CommerceData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [connections, setConnections] = useState<ConnectionSummary[]>([])
  // 'all' aggregates across every store of this platform; otherwise scoped to one store id (as string)
  const [selectedConnection, setSelectedConnection] = useState<string>(ALL_STORES)

  // Fetch the list of connections for this platform so the picker knows its options
  useEffect(() => {
    let cancelled = false
    async function loadConnections() {
      try {
        const res = await fetch(`/api/connections?type=${platform}&limit=100`)
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const rows: ConnectionSummary[] = (json.data ?? []).map((r: Record<string, unknown>) => ({
          id:              Number(r.id),
          name:            String(r.name ?? ''),
          storeIdentifier: String(r.storeIdentifier ?? ''),
          status:          String(r.status ?? 'active'),
        }))
        setConnections(rows)
      } catch {
        // non-fatal: picker just won't render
      }
    }
    void loadConnections()
    return () => { cancelled = true }
  }, [platform])

  // Reset the store filter when the platform switches
  useEffect(() => {
    setSelectedConnection(ALL_STORES)
  }, [platform])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ platform, days: '7' })
      if (selectedConnection !== ALL_STORES) {
        params.set('connectionId', selectedConnection)
      }
      const res = await fetch(`/api/analytics/commerce/stats?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error?.message ?? `Failed to load ${meta.label} analytics.`)
      }
      setData(json.data)
      setLastUpdated(new Date())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load analytics.'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, [platform, meta.label, selectedConnection])

  // Reset + reload whenever the platform or the selected store changes
  useEffect(() => {
    setData(null)
    load()
  }, [load])

  const kpis = data?.kpis
  const currency = data?.currency ?? meta.currencyFallback
  const orders = data?.ordersSeries ?? []
  const revenue = data?.revenueSeries ?? []
  const ordersLabeled = orders.map((s) => ({ ...s, label: fmtDay(s.day) }))
  const revenueLabeled = revenue.map((s) => ({ ...s, label: fmtDay(s.day) }))
  const hasOrdersData = orders.some((s) => s.total > 0)
  const hasRevenueData = revenue.some((s) => s.total > 0)
  const ordersWindowTotal = orders.reduce((a, s) => a + s.total, 0)
  const revenueWindowTotal = revenue.reduce((a, s) => a + s.total, 0)
  const PlatformIcon = meta.icon

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md"
            style={{ background: meta.accentColor, color: 'white' }}
          >
            <PlatformIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{meta.label} analytics</h2>
            <p className="text-sm text-muted-foreground">
              {selectedConnection === ALL_STORES
                ? `Orders, revenue, and sync activity across all ${meta.label} stores.`
                : (() => {
                    const match = connections.find((c) => String(c.id) === selectedConnection)
                    return match
                      ? `Scoped to ${match.name || match.storeIdentifier}.`
                      : `Orders, revenue, and sync activity for the selected ${meta.label} store.`
                  })()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {connections.length > 1 && (
            <Select
              value={selectedConnection}
              onValueChange={(v) => setSelectedConnection(v ?? ALL_STORES)}
            >
              <SelectTrigger className="h-8 w-[180px]" aria-label={`Select ${meta.label} store`}>
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STORES}>All stores ({connections.length})</SelectItem>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name || c.storeIdentifier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {lastUpdated && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={load}
            disabled={isLoading}
            aria-label={`Refresh ${meta.label} analytics`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-[0.625rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Orders (7d)"
          value={kpis?.ordersWindow ?? 0}
          helper={`${(kpis?.totalOrders ?? 0).toLocaleString()} total`}
          icon={ShoppingCart}
          isLoading={isLoading && !kpis}
        />
        <KpiCard
          label="Revenue (7d)"
          value={kpis ? fmtMoney(kpis.revenueWindow, currency) : '—'}
          helper={`${ordersWindowTotal.toLocaleString()} orders`}
          icon={DollarSign}
          isLoading={isLoading && !kpis}
        />
        <KpiCard
          label="Products"
          value={kpis?.totalProducts ?? 0}
          helper="synced"
          icon={Package}
          isLoading={isLoading && !kpis}
        />
        <KpiCard
          label="Customers"
          value={kpis?.totalCustomers ?? 0}
          helper={`${kpis?.newCustomersWindow ?? 0} new this week`}
          icon={UsersIcon}
          isLoading={isLoading && !kpis}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-[0.625rem] lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Orders (last 7 days)</CardTitle>
            <CardDescription>
              {isLoading && !data
                ? 'Loading…'
                : `${ordersWindowTotal.toLocaleString()} order${ordersWindowTotal === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-64 w-full" />
            ) : !hasOrdersData ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No orders in the last 7 days.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={ordersLabeled} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border, oklch(0.9 0 0))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, oklch(0.55 0 0))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, oklch(0.55 0 0))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    cursor={{ fill: 'var(--color-muted, oklch(0.96 0 0))', radius: 4 }}
                    contentStyle={{
                      borderRadius: '0.5rem',
                      border: '1px solid var(--color-border, oklch(0.9 0 0))',
                      background: 'var(--color-card, oklch(1 0 0))',
                      fontSize: '12px',
                      color: 'var(--color-foreground, oklch(0.1 0 0))',
                      boxShadow: 'none',
                    }}
                    formatter={(v: unknown) => [typeof v === 'number' ? v.toLocaleString() : String(v ?? ''), 'Orders']}
                  />
                  <Bar dataKey="total" fill={meta.accentColor} radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[0.625rem] lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Last sync</CardTitle>
            <CardDescription>Per target, latest run</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 px-0 pb-0">
            {isLoading && !data ? (
              <ul className="divide-y divide-border px-4" aria-label="Sync status loading">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 py-3">
                    <Skeleton className="h-5 w-16 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (data?.lastSync ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No sync runs yet.</p>
            ) : (
              <ul className="divide-y divide-border" aria-label="Latest sync runs">
                {(data?.lastSync ?? []).map((row) => {
                  const { icon: StatusIcon, cls } = syncStatusBadge(row.status)
                  return (
                    <li key={row.target} className="flex items-start gap-3 px-4 py-3">
                      <span className={`shrink-0 mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
                        <StatusIcon className="h-3 w-3" />
                        {row.status}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground capitalize">{row.target}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {row.recordsUpserted.toLocaleString()} upserted · {fmtRelative(row.finishedAt ?? row.startedAt)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-[0.625rem]">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenue (last 7 days)</CardTitle>
            <CardDescription>
              {isLoading && !data
                ? 'Loading…'
                : fmtMoney(revenueWindowTotal, currency)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-56 w-full" />
            ) : !hasRevenueData ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                No revenue in the last 7 days.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <AreaChart data={revenueLabeled} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`revFill-${platform}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor={meta.accentColor} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={meta.accentColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border, oklch(0.9 0 0))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, oklch(0.55 0 0))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, oklch(0.55 0 0))' }} axisLine={false} tickLine={false} />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '0.5rem',
                      border: '1px solid var(--color-border, oklch(0.9 0 0))',
                      background: 'var(--color-card, oklch(1 0 0))',
                      fontSize: '12px',
                      color: 'var(--color-foreground, oklch(0.1 0 0))',
                      boxShadow: 'none',
                    }}
                    formatter={(v: unknown) => [typeof v === 'number' ? fmtMoney(v, currency) : String(v ?? ''), 'Revenue']}
                  />
                  <Area type="monotone" dataKey="total" stroke={meta.accentColor} strokeWidth={2} fill={`url(#revFill-${platform})`} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[0.625rem]">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Orders by status</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-56 w-full" />
            ) : (data?.statusBreakdown ?? []).length === 0 ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <PieChart>
                  <Pie
                    data={data?.statusBreakdown ?? []}
                    dataKey="total"
                    nameKey="status"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="var(--color-card, oklch(1 0 0))"
                  >
                    {(data?.statusBreakdown ?? []).map((entry, i) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '0.5rem',
                      border: '1px solid var(--color-border, oklch(0.9 0 0))',
                      background: 'var(--color-card, oklch(1 0 0))',
                      fontSize: '12px',
                      color: 'var(--color-foreground, oklch(0.1 0 0))',
                      boxShadow: 'none',
                    }}
                    formatter={(v: unknown, n: unknown) => [typeof v === 'number' ? v.toLocaleString() : String(v ?? ''), String(n ?? '')]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[0.625rem] lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recently synced products</CardTitle>
            <CardDescription>Top {(data?.topProducts ?? []).length} by sync time</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {isLoading && !data ? (
              <ul className="divide-y divide-border px-4" aria-label="Products loading">
                {Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 py-3">
                    <Skeleton className="h-4 w-4/5" />
                  </li>
                ))}
              </ul>
            ) : (data?.topProducts ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No products synced yet.</p>
            ) : (
              <ul className="divide-y divide-border" aria-label="Recently synced products">
                {(data?.topProducts ?? []).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{p.title ?? '—'}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {p.sku ? `SKU ${p.sku}` : 'No SKU'} · {p.status ?? 'unknown'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-xs font-medium tabular-nums text-foreground">
                        {p.price != null ? fmtMoney(Number(p.price), p.currency ?? currency) : '—'}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {fmtRelative(p.syncedAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
