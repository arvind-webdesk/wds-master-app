'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ScrollText } from 'lucide-react'
import { DataTable } from '@/components/data-table/DataTable'
import { buildApiLogsColumns, type ApiLogListItem } from '@/components/api-logs/api-logs-columns'
import { ApiLogsToolbar, type ApiLogsFilters } from '@/components/api-logs/ApiLogsToolbar'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ApiLogDetailPanel } from '@/components/api-logs/ApiLogDetailPanel'
import { useAbility } from '@/lib/acl/ability-context'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildQS(
  filters: ApiLogsFilters,
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
  if (filters.q)           p.set('q', filters.q)
  if (filters.method)      p.set('method', filters.method)
  if (filters.status)      p.set('status', filters.status)
  if (filters.errorOnly)   p.set('errorOnly', 'true')
  if (filters.from)        p.set('from', filters.from)
  if (filters.to)          p.set('to', filters.to)
  if (filters.environment) p.set('environment', filters.environment)
  return p.toString()
}

function parseFiltersFromParams(params: URLSearchParams): ApiLogsFilters {
  return {
    q:           params.get('q') ?? '',
    method:      params.get('method') ?? '',
    status:      params.get('status') ?? '',
    errorOnly:   params.get('errorOnly') === 'true',
    from:        params.get('from') ?? '',
    to:          params.get('to') ?? '',
    environment: params.get('environment') ?? '',
  }
}

const EMPTY_FILTERS: ApiLogsFilters = {
  q: '', method: '', status: '', errorOnly: false, from: '', to: '', environment: '',
}

// ─── Forbidden state ─────────────────────────────────────────────────────────

function ForbiddenState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 p-6">
      <ScrollText className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">You don't have permission to view API logs.</p>
    </div>
  )
}

// ─── Inner list (all hooks live here) ────────────────────────────────────────

function ApiLogsList() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [rows, setRows]           = useState<ApiLogListItem[]>([])
  const [total, setTotal]         = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const [page,  setPage]  = useState(() => Number(searchParams.get('page') ?? '1'))
  const [limit, setLimit] = useState(() => Number(searchParams.get('limit') ?? '20'))
  const [sort,  setSort]  = useState(() => searchParams.get('sort') ?? 'createdAt')
  const [order, setOrder] = useState(() => searchParams.get('order') ?? 'desc')
  const [filters, setFilters] = useState<ApiLogsFilters>(() => parseFiltersFromParams(searchParams))

  // Sheet state
  const [selectedId, setSelectedId] = useState<number | null>(
    () => Number(searchParams.get('log')) || null,
  )
  const [sheetOpen, setSheetOpen] = useState(() => !!searchParams.get('log'))

  const abortRef = useRef<AbortController | null>(null)

  // ── Data loading ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setIsLoading(true)

    const qs = buildQS(filters, page, limit, sort, order)

    try {
      const res = await fetch(`/api/api-logs?${qs}`, { signal: abortRef.current.signal })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to load API logs')
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

  // ── URL sync ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const qs = buildQS(filters, page, limit, sort, order)
    const url = `/api-logs?${qs}${selectedId ? `&log=${selectedId}` : ''}`
    router.replace(url, { scroll: false })
  }, [filters, page, limit, sort, order, selectedId, router])

  useEffect(() => {
    load()
  }, [load])

  // ── Filter helpers ─────────────────────────────────────────────────────────
  function handleFiltersChange(next: Partial<ApiLogsFilters>) {
    setFilters((prev) => ({ ...prev, ...next }))
    setPage(1)
  }

  function handleClear() {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  // ── Sort ───────────────────────────────────────────────────────────────────
  function handleSortChange(s: { id: string; desc: boolean } | null) {
    if (!s) { setSort('createdAt'); setOrder('desc'); return }
    setSort(s.id)
    setOrder(s.desc ? 'desc' : 'asc')
    setPage(1)
  }

  // ── Sheet ──────────────────────────────────────────────────────────────────
  function openSheet(id: number) {
    setSelectedId(id)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setSelectedId(null)
  }

  const columns = buildApiLogsColumns(openSheet)

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">API Logs</h1>
          <p className="text-sm text-muted-foreground">
            Incoming request and background event logs.
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
          emptyMessage="No API logs match your filters."
          toolbar={
            <ApiLogsToolbar
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onClear={handleClear}
              onRefresh={load}
              isLoading={isLoading}
            />
          }
        />
      </div>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet() }}>
        <SheetContent
          side="right"
          className="w-full sm:w-[720px] sm:max-w-[720px] p-0 flex flex-col gap-0"
          showCloseButton
        >
          <SheetHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
            <SheetTitle>Log Detail</SheetTitle>
            <SheetDescription>
              {selectedId ? `Log #${selectedId}` : 'Inspect request and response data'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {selectedId !== null && (
              <ApiLogDetailPanel logId={selectedId} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

// ─── Page (ACL gate, then render inner) ──────────────────────────────────────

export default function ApiLogsPage() {
  const ability = useAbility()

  if (!ability.can('read', 'ApiLog')) {
    return <ForbiddenState />
  }

  return <ApiLogsList />
}
