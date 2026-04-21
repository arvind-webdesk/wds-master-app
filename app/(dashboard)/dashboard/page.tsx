'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAbility } from '@/lib/acl/ability-context'
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import {
  Users, UserCheck, Shield, Activity, RefreshCw, AlertCircle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  CartesianGrid, ResponsiveContainer, AreaChart, Area,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Kpis {
  totalUsers: number
  activeUsers: number
  totalRoles: number
  apiCallsToday: number
  apiErrorsToday: number
}

interface SeriesPoint {
  day: string
  total: number
  errors: number
}

interface ActivityRow {
  id: number
  logType: string | null
  message: string | null
  method: string | null
  url: string | null
  responseStatus: number | null
  isError: boolean
  durationMs: number | null
  createdAt: string
}

interface DashboardData {
  kpis: Kpis
  apiCallsSeries: SeriesPoint[]
  signupsSeries: { day: string; total: number }[]
  methodBreakdown: { method: string; total: number }[]
  statusBreakdown: { bucket: string; total: number }[]
  avgDurationSeries: { day: string; avgMs: number }[]
  recentActivity: ActivityRow[]
}

const METHOD_COLORS: Record<string, string> = {
  GET:    'oklch(0.65 0.15 230)',
  POST:   'oklch(0.65 0.17 150)',
  PUT:    'oklch(0.75 0.15 80)',
  PATCH:  'oklch(0.60 0.20 300)',
  DELETE: 'oklch(0.60 0.22 25)',
  UNKNOWN:'oklch(0.70 0 0)',
}

const STATUS_COLORS: Record<string, string> = {
  '2xx':   'oklch(0.65 0.17 150)',
  '3xx':   'oklch(0.70 0.15 230)',
  '4xx':   'oklch(0.75 0.16 80)',
  '5xx':   'oklch(0.60 0.22 25)',
  'other': 'oklch(0.70 0 0)',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDay(iso: string) {
  try {
    return format(parseISO(iso), 'MMM d')
  } catch {
    return iso
  }
}

function fmtRelative(raw: string) {
  try {
    // SQLite format: "YYYY-MM-DD HH:MM:SS" — replace space with T for parseISO
    const date = parseISO(raw.replace(' ', 'T') + 'Z')
    return formatDistanceToNow(date, { addSuffix: true })
  } catch {
    return raw
  }
}

function statusColor(status: number | null, isError: boolean) {
  if (isError || (status !== null && status >= 400)) return 'text-destructive bg-destructive/10'
  if (status !== null && status >= 300) return 'text-amber-600 bg-amber-50 dark:bg-amber-950/30'
  if (status !== null && status >= 200) return 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30'
  return 'text-muted-foreground bg-muted'
}

function methodColor(method: string | null) {
  switch (method?.toUpperCase()) {
    case 'GET':    return 'text-sky-700 bg-sky-50 dark:bg-sky-950/30'
    case 'POST':   return 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30'
    case 'PUT':    return 'text-amber-700 bg-amber-50 dark:bg-amber-950/30'
    case 'PATCH':  return 'text-violet-700 bg-violet-50 dark:bg-violet-950/30'
    case 'DELETE': return 'text-destructive bg-destructive/10'
    default:       return 'text-muted-foreground bg-muted'
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  helper,
  helperDestructive,
  icon: Icon,
  isLoading,
}: {
  label: string
  value: number | string
  helper: string
  helperDestructive?: boolean
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
            <p className={`text-xs mt-1 ${helperDestructive ? 'text-destructive' : 'text-muted-foreground'}`}>
              {helper}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const ability = useAbility()
  const canRead = ability.can('read', 'Dashboard')
  const canReadApiLog = ability.can('read', 'ApiLog')

  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    if (!canRead) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/stats?days=7&activityLimit=10')
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to load dashboard.')
      }
      setData(json.data)
      setLastUpdated(new Date())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard.'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, [canRead])

  // Initial mount
  useEffect(() => {
    load()
  }, [load])

  // Refetch on window focus
  useEffect(() => {
    function onFocus() { load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // ── 403 state ──────────────────────────────────────────────────────────────
  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <Card className="rounded-[0.625rem] max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle className="text-base text-destructive">Access denied</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You do not have access to the dashboard. Contact an administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const kpis = data?.kpis
  const series = data?.apiCallsSeries ?? []
  const activity = data?.recentActivity ?? []
  const hasChartData = series.some((s) => s.total > 0)

  const seriesWithLabel = series.map((s) => ({ ...s, label: fmtDay(s.day) }))
  const totalWindow = series.reduce((acc, s) => acc + s.total, 0)
  const errorsWindow = series.reduce((acc, s) => acc + s.errors, 0)

  const activeRatio =
    kpis && kpis.totalUsers > 0
      ? `${Math.round((kpis.activeUsers / kpis.totalUsers) * 100)}%`
      : '—'

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of users, roles, and API activity.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 rounded-[0.625rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {/* ── KPI grid ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total users"
          value={kpis?.totalUsers ?? 0}
          helper={`${kpis?.activeUsers ?? 0} active`}
          icon={Users}
          isLoading={isLoading && !kpis}
        />
        <KpiCard
          label="Active users"
          value={kpis?.activeUsers ?? 0}
          helper={`${activeRatio} of total`}
          icon={UserCheck}
          isLoading={isLoading && !kpis}
        />
        <KpiCard
          label="Roles"
          value={kpis?.totalRoles ?? 0}
          helper="configured"
          icon={Shield}
          isLoading={isLoading && !kpis}
        />
        <KpiCard
          label="API calls today"
          value={kpis?.apiCallsToday ?? 0}
          helper={
            kpis
              ? kpis.apiErrorsToday > 0
                ? `${kpis.apiErrorsToday} error${kpis.apiErrorsToday === 1 ? '' : 's'}`
                : 'No errors'
              : '—'
          }
          helperDestructive={!!kpis && kpis.apiErrorsToday > 0}
          icon={Activity}
          isLoading={isLoading && !kpis}
        />
      </div>

      {/* ── Chart + Activity row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Chart — spans 2 cols on lg */}
        <Card
          className="rounded-[0.625rem] lg:col-span-2"
          aria-label={`API calls chart: ${totalWindow} total calls, ${errorsWindow} errors over the last 7 days`}
        >
          <CardHeader>
            <CardTitle className="text-sm font-medium">API calls (last 7 days)</CardTitle>
            <CardDescription>
              {isLoading && !data
                ? 'Loading…'
                : `${totalWindow.toLocaleString()} total · ${errorsWindow.toLocaleString()} error${errorsWindow === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-64 w-full" />
            ) : !hasChartData ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No API activity in the last 7 days.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart
                  data={seriesWithLabel}
                  margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="var(--color-border, oklch(0.9 0 0))"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, oklch(0.55 0 0))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, oklch(0.55 0 0))' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
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
                    formatter={(value: unknown, name: unknown) => [
                      typeof value === 'number' ? value.toLocaleString() : String(value ?? ''),
                      name === 'total' ? 'Requests' : 'Errors',
                    ]}
                    labelFormatter={(label) => label}
                  />
                  <Bar
                    dataKey="total"
                    name="total"
                    fill="var(--color-primary, oklch(0.55 0.2 250))"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="errors"
                    name="errors"
                    fill="var(--color-destructive, oklch(0.55 0.22 25))"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent activity — 1 col on lg */}
        <Card className="rounded-[0.625rem] lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent activity</CardTitle>
            <CardDescription>Latest 10 API events</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 px-0 pb-0">
            {isLoading && !data ? (
              <ul className="divide-y divide-border px-4" aria-label="Recent activity loading">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 py-3">
                    <Skeleton className="h-5 w-12 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Skeleton className="h-4 w-10 rounded" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : activity.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-border" aria-label="Recent API activity">
                {activity.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0"
                  >
                    {/* Method badge */}
                    <span
                      className={`shrink-0 mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${methodColor(row.method)}`}
                    >
                      {row.method ?? '—'}
                    </span>

                    {/* URL + message */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-foreground">{row.url ?? '—'}</p>
                      {row.message && (
                        <p className="truncate text-[11px] text-muted-foreground">{row.message}</p>
                      )}
                    </div>

                    {/* Status + time */}
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${statusColor(row.responseStatus, row.isError)}`}
                      >
                        {row.responseStatus ?? '—'}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {fmtRelative(row.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>

          {/* View all footer — gated on ApiLog read */}
          {canReadApiLog && (
            <div className="border-t border-border px-4 py-3">
              <Link
                href="/api-logs"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View all API logs
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* ── Additional analytics ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Signups trend */}
        <Card className="rounded-[0.625rem]">
          <CardHeader>
            <CardTitle className="text-sm font-medium">New signups (last 7 days)</CardTitle>
            <CardDescription>
              {isLoading && !data
                ? 'Loading…'
                : `${(data?.signupsSeries ?? []).reduce((a, s) => a + s.total, 0).toLocaleString()} new users`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <AreaChart
                  data={(data?.signupsSeries ?? []).map((s) => ({ ...s, label: fmtDay(s.day) }))}
                  margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="signupsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="var(--color-primary, oklch(0.55 0.2 250))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-primary, oklch(0.55 0.2 250))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border, oklch(0.9 0 0))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, oklch(0.55 0 0))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, oklch(0.55 0 0))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '0.5rem',
                      border: '1px solid var(--color-border, oklch(0.9 0 0))',
                      background: 'var(--color-card, oklch(1 0 0))',
                      fontSize: '12px',
                      color: 'var(--color-foreground, oklch(0.1 0 0))',
                      boxShadow: 'none',
                    }}
                    formatter={(v: unknown) => [typeof v === 'number' ? v.toLocaleString() : String(v ?? ''), 'Signups']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--color-primary, oklch(0.55 0.2 250))"
                    strokeWidth={2}
                    fill="url(#signupsFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Avg response time trend */}
        <Card className="rounded-[0.625rem]">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Avg response time (last 7 days)</CardTitle>
            <CardDescription>
              {isLoading && !data
                ? 'Loading…'
                : (() => {
                    const rows = data?.avgDurationSeries ?? []
                    const nonZero = rows.filter((r) => r.avgMs > 0)
                    if (nonZero.length === 0) return 'No latency data'
                    const avg = Math.round(nonZero.reduce((a, r) => a + r.avgMs, 0) / nonZero.length)
                    return `${avg.toLocaleString()} ms average`
                  })()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <LineChart
                  data={(data?.avgDurationSeries ?? []).map((s) => ({ ...s, label: fmtDay(s.day) }))}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border, oklch(0.9 0 0))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, oklch(0.55 0 0))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, oklch(0.55 0 0))' }} axisLine={false} tickLine={false} unit=" ms" />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '0.5rem',
                      border: '1px solid var(--color-border, oklch(0.9 0 0))',
                      background: 'var(--color-card, oklch(1 0 0))',
                      fontSize: '12px',
                      color: 'var(--color-foreground, oklch(0.1 0 0))',
                      boxShadow: 'none',
                    }}
                    formatter={(v: unknown) => [typeof v === 'number' ? `${v.toLocaleString()} ms` : String(v ?? ''), 'Avg']}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgMs"
                    stroke="var(--color-primary, oklch(0.55 0.2 250))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* HTTP method distribution */}
        <Card className="rounded-[0.625rem]">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Requests by method</CardTitle>
            <CardDescription>Distribution over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <Skeleton className="h-56 w-full" />
            ) : (data?.methodBreakdown ?? []).length === 0 ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <PieChart>
                  <Pie
                    data={data?.methodBreakdown ?? []}
                    dataKey="total"
                    nameKey="method"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="var(--color-card, oklch(1 0 0))"
                  >
                    {(data?.methodBreakdown ?? []).map((entry) => (
                      <Cell
                        key={entry.method}
                        fill={METHOD_COLORS[entry.method.toUpperCase()] ?? METHOD_COLORS.UNKNOWN}
                      />
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

        {/* Status code breakdown */}
        <Card className="rounded-[0.625rem]">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Status code breakdown</CardTitle>
            <CardDescription>2xx / 3xx / 4xx / 5xx share</CardDescription>
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
                    nameKey="bucket"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="var(--color-card, oklch(1 0 0))"
                  >
                    {(data?.statusBreakdown ?? []).map((entry) => (
                      <Cell
                        key={entry.bucket}
                        fill={STATUS_COLORS[entry.bucket] ?? STATUS_COLORS.other}
                      />
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
      </div>
    </div>
  )
}
