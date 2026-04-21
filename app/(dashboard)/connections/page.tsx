'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, Plug, X } from 'lucide-react'
import { DataTable } from '@/components/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAbility } from '@/lib/acl/ability-context'
import { buildColumns, type ConnectionRow } from '@/components/connections/connections-columns'
import { ConnectionsSheet } from '@/components/connections/connections-sheet'
import type { ConnectionType } from '@/lib/db/schema/connections'

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30'
      }`}
    >
      {label}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const ability = useAbility()
  const router = useRouter()
  const searchParams = useSearchParams()

  const canCreate = ability.can('create', 'Connection')
  const canRead = ability.can('read', 'Connection')

  // ── State ──
  const [rows, setRows] = useState<ConnectionRow[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [page, setPage] = useState(() => Number(searchParams.get('page') ?? 1))
  const [limit, setLimit] = useState(() => Number(searchParams.get('limit') ?? 20))
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [typeFilter, setTypeFilter] = useState<string>(searchParams.get('type') ?? '')
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') ?? '')
  const [sort, setSort] = useState(searchParams.get('sort') ?? '')
  const [order, setOrder] = useState(searchParams.get('order') ?? 'desc')

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<'create' | 'edit'>('create')
  const [editRow, setEditRow] = useState<ConnectionRow | null>(null)
  const [sheetInitialType, setSheetInitialType] = useState<ConnectionType | undefined>()

  const debouncedSearch = useDebounce(search, 300)

  // ── OAuth return banner ──
  useEffect(() => {
    if (searchParams.get('connected') === '1') {
      toast.success('Connection established')
      const params = new URLSearchParams(searchParams.toString())
      params.delete('connected')
      router.replace(`/connections${params.size ? `?${params}` : ''}`)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── URL sync ──
  useEffect(() => {
    const params = new URLSearchParams()
    if (page > 1) params.set('page', String(page))
    if (limit !== 20) params.set('limit', String(limit))
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (typeFilter) params.set('type', typeFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (sort) params.set('sort', sort)
    if (order !== 'desc') params.set('order', order)
    router.replace(`/connections${params.size ? `?${params}` : ''}`, { scroll: false })
  }, [page, limit, debouncedSearch, typeFilter, statusFilter, sort, order]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data fetch ──
  const load = useCallback(async () => {
    if (!canRead) return
    setIsLoading(true)
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        order,
      })
      if (debouncedSearch) qs.set('search', debouncedSearch)
      if (typeFilter) qs.set('type', typeFilter)
      if (statusFilter) qs.set('status', statusFilter)
      if (sort) qs.set('sort', sort)

      const res = await fetch(`/api/connections?${qs}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to load connections')
        return
      }
      setRows(json.data ?? [])
      setTotal(json.meta?.total ?? 0)
    } finally {
      setIsLoading(false)
    }
  }, [canRead, page, limit, debouncedSearch, typeFilter, statusFilter, sort, order])

  useEffect(() => {
    load()
  }, [load])

  // ── Columns ──
  const columns = useMemo(
    () =>
      buildColumns({
        onEdit: (row) => {
          setEditRow(row)
          setSheetMode('edit')
          setSheetOpen(true)
        },
        onRefresh: load,
      }),
    [load]
  )

  const hasFilters = !!(typeFilter || statusFilter || search)

  function clearFilters() {
    setTypeFilter('')
    setStatusFilter('')
    setSearch('')
    setPage(1)
  }

  function openCreateSheet(type?: ConnectionType) {
    setSheetMode('create')
    setEditRow(null)
    setSheetInitialType(type)
    setSheetOpen(true)
  }

  // ── Not authorized ──
  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Plug className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You do not have access to connections.</p>
        </div>
      </div>
    )
  }

  // ── Toolbar ──
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative w-56">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search connections..."
          className="h-8 pl-8 text-xs"
        />
      </div>

      {/* Type filter chips */}
      <div className="flex items-center gap-1">
        <FilterChip label="All types" active={!typeFilter} onClick={() => { setTypeFilter(''); setPage(1) }} />
        <FilterChip label="Shopify" active={typeFilter === 'shopify'} onClick={() => { setTypeFilter('shopify'); setPage(1) }} />
        <FilterChip label="BigCommerce" active={typeFilter === 'bigcommerce'} onClick={() => { setTypeFilter('bigcommerce'); setPage(1) }} />
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1">
        <FilterChip label="All statuses" active={!statusFilter} onClick={() => { setStatusFilter(''); setPage(1) }} />
        <FilterChip label="Active" active={statusFilter === 'active'} onClick={() => { setStatusFilter('active'); setPage(1) }} />
        <FilterChip label="Disabled" active={statusFilter === 'disabled'} onClick={() => { setStatusFilter('disabled'); setPage(1) }} />
        <FilterChip label="Error" active={statusFilter === 'error'} onClick={() => { setStatusFilter('error'); setPage(1) }} />
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex h-7 items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
          Clear all
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Connections</h1>
          <p className="text-sm text-muted-foreground">
            Manage your Shopify and BigCommerce platform connections.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => openCreateSheet()} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            New connection
          </Button>
        )}
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
          if (s) { setSort(s.id); setOrder(s.desc ? 'desc' : 'asc') }
          else { setSort(''); setOrder('desc') }
        }}
        toolbar={toolbar}
        emptyMessage="No connections found."
      />

      {/* Custom empty state with CTAs — only when no filters and genuinely empty */}
      {!isLoading && rows.length === 0 && !hasFilters && (
        <div className="flex flex-col items-center gap-4 rounded-[0.625rem] border border-border bg-card p-10">
          <Plug className="h-10 w-10 text-muted-foreground" />
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">No connections yet</p>
            <p className="text-xs text-muted-foreground">
              Connect a commerce platform to start syncing data.
            </p>
          </div>
          {canCreate && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => openCreateSheet('shopify')}>
                Connect Shopify
              </Button>
              <Button size="sm" onClick={() => openCreateSheet('bigcommerce')}>
                Connect BigCommerce
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Sheet */}
      <ConnectionsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={load}
        mode={sheetMode}
        connection={editRow}
        initialType={sheetInitialType}
      />
    </div>
  )
}
