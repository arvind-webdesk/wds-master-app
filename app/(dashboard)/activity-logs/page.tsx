'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Activity } from 'lucide-react'
import { toast } from 'sonner'
import { useAbility } from '@/lib/acl/ability-context'
import { DataTable } from '@/components/data-table/DataTable'
import { activityLogsColumns, type ActivityLogRow } from '@/components/activity-logs/activity-logs-columns'
import {
  ActivityLogsFilters,
  type ActivityLogFilters,
} from '@/components/activity-logs/activity-logs-filters'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityLogsPage() {
  const ability = useAbility()
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── CASL gate ──
  const canRead = ability.can('read', 'ActivityLog')

  // ── URL-synced state ──
  const [page, setPage] = useState(() => Number(searchParams.get('page') ?? '1'))
  const [limit, setLimit] = useState(() => Number(searchParams.get('limit') ?? '20'))
  const [sort, setSort] = useState(() => searchParams.get('sort') ?? 'createdAt')
  const [order, setOrder] = useState<'asc' | 'desc'>(
    () => (searchParams.get('order') as 'asc' | 'desc') ?? 'desc',
  )

  const [filters, setFilters] = useState<ActivityLogFilters>(() => ({
    search: searchParams.get('search') ?? '',
    userId: searchParams.get('userId') ?? '',
    action: searchParams.get('action') ?? '',
    subjectType: searchParams.get('subjectType') ?? '',
    dateFrom: searchParams.get('dateFrom') ?? '',
    dateTo: searchParams.get('dateTo') ?? '',
  }))

  // ── Data state ──
  const [rows, setRows] = useState<ActivityLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // ── Sync URL ──
  useEffect(() => {
    const qs = new URLSearchParams()
    if (page > 1) qs.set('page', String(page))
    if (limit !== 20) qs.set('limit', String(limit))
    if (sort !== 'createdAt') qs.set('sort', sort)
    if (order !== 'desc') qs.set('order', order)
    if (filters.search) qs.set('search', filters.search)
    if (filters.userId) qs.set('userId', filters.userId)
    if (filters.action) qs.set('action', filters.action)
    if (filters.subjectType) qs.set('subjectType', filters.subjectType)
    if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom)
    if (filters.dateTo) qs.set('dateTo', filters.dateTo)
    router.replace(`/activity-logs?${qs.toString()}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, sort, order, filters])

  // ── Fetch ──
  const load = useCallback(async () => {
    if (!canRead) return
    setIsLoading(true)
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
      order,
    })
    if (filters.search) qs.set('search', filters.search)
    if (filters.userId) qs.set('userId', filters.userId)
    if (filters.action) qs.set('action', filters.action)
    if (filters.subjectType) qs.set('subjectType', filters.subjectType)
    if (filters.dateFrom) {
      // Convert local datetime-local value to ISO 8601
      qs.set('dateFrom', new Date(filters.dateFrom).toISOString())
    }
    if (filters.dateTo) {
      qs.set('dateTo', new Date(filters.dateTo).toISOString())
    }
    try {
      const res = await fetch(`/api/activity-logs?${qs}`)
      const json = await res.json()
      if (res.ok) {
        setRows(json.data ?? [])
        setTotal(json.meta?.total ?? 0)
      } else {
        toast.error(json.error?.message ?? 'Failed to load activity logs')
      }
    } catch {
      toast.error('Network error — could not load activity logs')
    } finally {
      setIsLoading(false)
    }
  }, [canRead, page, limit, sort, order, filters])

  useEffect(() => {
    load()
  }, [load])

  // ── Columns (stable ref) ──
  const columns = useMemo(() => activityLogsColumns, [])

  // ── Filter helpers ──
  function handleFiltersChange(next: Partial<ActivityLogFilters>) {
    setFilters((prev) => ({ ...prev, ...next }))
    setPage(1)
  }

  function handleClearAll() {
    setFilters({ search: '', userId: '', action: '', subjectType: '', dateFrom: '', dateTo: '' })
    setPage(1)
  }

  // ── Empty message ──
  const hasActiveFilters =
    filters.search !== '' ||
    filters.userId !== '' ||
    filters.action !== '' ||
    filters.subjectType !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== ''

  const emptyMessage = hasActiveFilters
    ? 'No activity matches these filters.'
    : 'No activity recorded yet.'

  // ── CASL blocked state ──
  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
        <Activity className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          You do not have permission to view activity logs.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Activity Logs</h1>
        <p className="text-sm text-muted-foreground">
          Read-only audit trail of actions performed across the dashboard.
        </p>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        total={total}
        page={page}
        limit={limit}
        isLoading={isLoading}
        onPageChange={setPage}
        onLimitChange={(n) => { setLimit(n); setPage(1) }}
        onSortChange={(s) => {
          if (s) {
            setSort(s.id)
            setOrder(s.desc ? 'desc' : 'asc')
          } else {
            setSort('createdAt')
            setOrder('desc')
          }
          setPage(1)
        }}
        toolbar={
          <ActivityLogsFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearAll={handleClearAll}
          />
        }
        emptyMessage={emptyMessage}
      />
    </div>
  )
}
