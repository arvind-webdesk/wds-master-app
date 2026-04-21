'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { History } from 'lucide-react'
import { DataTable } from '@/components/data-table/DataTable'
import {
  buildSyncHistoryColumns,
  type SyncRunListItem,
} from '@/components/sync-history/sync-history-columns'
import {
  SyncHistoryToolbar,
  type SyncHistoryFilters,
  type ConnectionOption,
} from '@/components/sync-history/SyncHistoryToolbar'
import { useAbility } from '@/lib/acl/ability-context'

// ─── Forbidden state ──────────────────────────────────────────────────────────

function ForbiddenState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 p-6">
      <History className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        You don&apos;t have permission to view sync history.
      </p>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildQS(
  filters: SyncHistoryFilters,
  page: number,
  limit: number,
  sort: string,
  order: string,
): string {
  const p = new URLSearchParams()
  p.set('page', String(page))
  p.set('limit', String(limit))
  p.set('sort', sort)
  p.set('order', order)
  if (filters.q)            p.set('q', filters.q)
  if (filters.platform)     p.set('platform', filters.platform)
  if (filters.target)       p.set('target', filters.target)
  if (filters.status)       p.set('status', filters.status)
  if (filters.connectionId) p.set('connectionId', filters.connectionId)
  if (filters.dateFrom)     p.set('dateFrom', filters.dateFrom)
  if (filters.dateTo)       p.set('dateTo', filters.dateTo)
  return p.toString()
}

function parseFiltersFromParams(params: URLSearchParams): SyncHistoryFilters {
  return {
    q:            params.get('q')            ?? '',
    platform:     params.get('platform')     ?? '',
    target:       params.get('target')       ?? '',
    status:       params.get('status')       ?? '',
    connectionId: params.get('connectionId') ?? '',
    dateFrom:     params.get('dateFrom')     ?? '',
    dateTo:       params.get('dateTo')       ?? '',
  }
}

const EMPTY_FILTERS: SyncHistoryFilters = {
  q: '', platform: '', target: '', status: '', connectionId: '', dateFrom: '', dateTo: '',
}

// ─── Inner list (hooks live here) ─────────────────────────────────────────────

function SyncHistoryList() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [rows, setRows]           = useState<SyncRunListItem[]>([])
  const [total, setTotal]         = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const [page,  setPage]  = useState(() => Number(searchParams.get('page')  ?? '1'))
  const [limit, setLimit] = useState(() => Number(searchParams.get('limit') ?? '20'))
  const [sort,  setSort]  = useState(() => searchParams.get('sort')  ?? 'startedAt')
  const [order, setOrder] = useState(() => searchParams.get('order') ?? 'desc')
  const [filters, setFilters] = useState<SyncHistoryFilters>(() => parseFiltersFromParams(searchParams))

  // Connections for the filter dropdown
  const [connections, setConnections]               = useState<ConnectionOption[]>([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // ── Load connections once ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setConnectionsLoading(true)
    fetch('/api/connections?limit=100')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.data) {
          setConnections(
            (json.data as Array<{ id: number; name: string; type: string }>).map((c) => ({
              id:   c.id,
              name: c.name,
              type: c.type,
            })),
          )
        }
      })
      .catch(() => { /* silently ignore — connection filter is non-critical */ })
      .finally(() => { if (!cancelled) setConnectionsLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setIsLoading(true)

    const qs = buildQS(filters, page, limit, sort, order)

    try {
      const res  = await fetch(`/api/sync-history?${qs}`, { signal: abortRef.current.signal })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to load sync history')
        return
      }

      setRows(json.data)
      setTotal(json.meta?.total ?? 0)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      toast.error(err instanceof Error ? err.message : 'Network error')
    } finally {
      setIsLoading(false)
    }
  }, [filters, page, limit, sort, order])

  // ── URL sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const qs  = buildQS(filters, page, limit, sort, order)
    router.replace(`/sync-history?${qs}`, { scroll: false })
  }, [filters, page, limit, sort, order, router])

  useEffect(() => {
    load()
  }, [load])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleFiltersChange(next: Partial<SyncHistoryFilters>) {
    setFilters((prev) => ({ ...prev, ...next }))
    setPage(1)
  }

  function handleClear() {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  function handleSortChange(s: { id: string; desc: boolean } | null) {
    if (!s) { setSort('startedAt'); setOrder('desc'); return }
    setSort(s.id)
    setOrder(s.desc ? 'desc' : 'asc')
    setPage(1)
  }

  // ── Row click → detail page ───────────────────────────────────────────────
  function handleRowClick(row: SyncRunListItem) {
    const currentQS = buildQS(filters, page, limit, sort, order)
    const from = encodeURIComponent(`/sync-history?${currentQS}`)
    router.push(`/sync-history/${row.id}?from=${from}`)
  }

  const currentQS = buildQS(filters, page, limit, sort, order)
  const columns   = buildSyncHistoryColumns(currentQS)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Sync History</h1>
        <p className="text-sm text-muted-foreground">
          Audit trail of all integration sync runs across platforms.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        total={total}
        page={page}
        limit={limit}
        isLoading={isLoading}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1) }}
        onSortChange={handleSortChange}
        onRowClick={handleRowClick}
        emptyMessage="No sync runs match your filters."
        toolbar={
          <SyncHistoryToolbar
            filters={filters}
            connections={connections}
            connectionsLoading={connectionsLoading}
            onFiltersChange={handleFiltersChange}
            onClear={handleClear}
            onRefresh={load}
            isLoading={isLoading}
          />
        }
      />
    </div>
  )
}

// ─── Page (ACL gate) ──────────────────────────────────────────────────────────

export default function SyncHistoryPage() {
  const ability = useAbility()

  if (!ability.can('read', 'SyncRun')) {
    return <ForbiddenState />
  }

  return <SyncHistoryList />
}
