'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, X, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAbility } from '@/lib/acl/ability-context'
import { buildColumns, type SyncScheduleRow } from '@/components/cron-sync/cron-sync-columns'
import { CronSyncSheet } from '@/components/cron-sync/cron-sync-sheet'
import { RunProgressModal } from '@/components/cron-sync/run-progress-modal'
import { RunAdHocModal } from '@/components/cron-sync/run-ad-hoc-modal'

// ─── Constants ───────────────────────────────────────────────────────────────

const BANNER_KEY = 'cron-sync:banner-dismissed'

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface ConnectionOption {
  id: number
  name: string
  platform: string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CronSyncPage() {
  const ability = useAbility()
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── CASL ──────────────────────────────────────────────────────────────────
  const canCreate = ability.can('create', 'SyncSchedule')
  const canUpdate = ability.can('update', 'SyncSchedule')

  // ── URL-synced state ──────────────────────────────────────────────────────
  const page = Number(searchParams.get('page') ?? '1')
  const limit = Number(searchParams.get('limit') ?? '20')
  const search = searchParams.get('search') ?? ''
  const connectionIdFilter = searchParams.get('connectionId') ?? ''
  const targetFilter = searchParams.get('target') ?? ''
  const enabledFilter = searchParams.get('enabled') ?? ''
  const sort = searchParams.get('sort') ?? ''
  const order = searchParams.get('order') ?? ''

  // ── Local derived state for the search input (debounced) ──────────────────
  const [searchInput, setSearchInput] = useState(search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<SyncScheduleRow[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // ── Connections for filter dropdown ───────────────────────────────────────
  const [connections, setConnections] = useState<ConnectionOption[]>([])

  // ── Sheet ──────────────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<'create' | 'edit'>('create')
  const [editTarget, setEditTarget] = useState<SyncScheduleRow | null>(null)

  // ── Progress modal ────────────────────────────────────────────────────────
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressJobId, setProgressJobId] = useState<number | null>(null)

  // ── Ad-hoc modal ──────────────────────────────────────────────────────────
  const [adHocOpen, setAdHocOpen] = useState(false)

  // ── Banner ────────────────────────────────────────────────────────────────
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(BANNER_KEY) === '1'
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const [, startMutation] = useTransition()

  // ── URL sync helper ───────────────────────────────────────────────────────
  const pushParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '' || v === undefined) {
          params.delete(k)
        } else {
          params.set(k, String(v))
        }
      }
      router.replace(`/cron-sync?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setIsLoading(true)
    const qs = new URLSearchParams()
    qs.set('page', String(page))
    qs.set('limit', String(limit))
    if (search) qs.set('search', search)
    if (connectionIdFilter) qs.set('connectionId', connectionIdFilter)
    if (targetFilter) qs.set('target', targetFilter)
    if (enabledFilter) qs.set('enabled', enabledFilter)
    if (sort) qs.set('sort', sort)
    if (order) qs.set('order', order)

    try {
      const res = await fetch(`/api/cron-sync?${qs.toString()}`)
      const json = await res.json()
      if (res.ok) {
        setRows(json.data ?? [])
        setTotal(json.meta?.total ?? 0)
      } else {
        toast.error(json.error?.message ?? 'Failed to load schedules')
      }
    } catch {
      toast.error('Network error loading schedules')
    } finally {
      setIsLoading(false)
    }
  }, [page, limit, search, connectionIdFilter, targetFilter, enabledFilter, sort, order])

  useEffect(() => { load() }, [load])

  // ── Load connections for filter ────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/connections?limit=100')
      .then((r) => r.json())
      .then((json) => setConnections(json.data ?? []))
      .catch(() => {})
  }, [])

  // ── Search debounce ───────────────────────────────────────────────────────
  useEffect(() => {
    setSearchInput(search)
  }, [search])

  function handleSearchChange(value: string) {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      pushParams({ search: value || null, page: 1 })
    }, 300)
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function handleRunNow(row: SyncScheduleRow) {
    startMutation(async () => {
      const res = await fetch(`/api/cron-sync/${row.id}/run`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          toast.error(json.error?.message ?? 'A sync is already running for this connection and target')
          return
        }
        toast.error(json.error?.message ?? 'Failed to start sync')
        return
      }
      setProgressJobId(json.data.jobId)
      setProgressOpen(true)
    })
  }

  function handleToggleEnabled(row: SyncScheduleRow) {
    const next = !row.enabled
    // Optimistic update
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, enabled: next } : r)),
    )
    startMutation(async () => {
      const res = await fetch(`/api/cron-sync/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      const json = await res.json()
      if (!res.ok) {
        // Revert
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, enabled: row.enabled } : r)),
        )
        toast.error(json.error?.message ?? 'Failed to update schedule')
        return
      }
      toast.success(next ? 'Schedule enabled' : 'Schedule disabled')
    })
  }

  function handleDelete(row: SyncScheduleRow) {
    if (!window.confirm(`Delete schedule for "${row.connection.name} / ${row.target}"?`)) return
    startMutation(async () => {
      const res = await fetch(`/api/cron-sync/${row.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to delete schedule')
        return
      }
      toast.success('Schedule deleted')
      load()
    })
  }

  function handleEdit(row: SyncScheduleRow) {
    setEditTarget(row)
    setSheetMode('edit')
    setSheetOpen(true)
  }

  function handleNew() {
    setEditTarget(null)
    setSheetMode('create')
    setSheetOpen(true)
  }

  function handleAdHocJobStarted(jobId: number) {
    setProgressJobId(jobId)
    setProgressOpen(true)
  }

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(
    () =>
      buildColumns({
        onEdit: handleEdit,
        onRunNow: handleRunNow,
        onToggleEnabled: handleToggleEnabled,
        onDelete: handleDelete,
        onRefresh: load,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load],
  )

  // ── Active filters ────────────────────────────────────────────────────────
  const hasFilters = !!(connectionIdFilter || targetFilter || enabledFilter || search)

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative w-56">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search schedules..."
          className="h-8 pl-8 text-xs"
        />
      </div>

      {/* Connection filter */}
      <Select
        value={connectionIdFilter || 'all'}
        onValueChange={(v) => pushParams({ connectionId: v === 'all' ? null : v, page: 1 })}
      >
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue placeholder="All connections" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All connections</SelectItem>
          {connections.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Target filter */}
      <Select
        value={targetFilter || 'all'}
        onValueChange={(v) => pushParams({ target: v === 'all' ? null : v, page: 1 })}
      >
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue placeholder="All targets" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All targets</SelectItem>
          <SelectItem value="products">Products</SelectItem>
          <SelectItem value="orders">Orders</SelectItem>
          <SelectItem value="customers">Customers</SelectItem>
        </SelectContent>
      </Select>

      {/* Enabled filter */}
      <Select
        value={enabledFilter || 'all'}
        onValueChange={(v) => pushParams({ enabled: v === 'all' ? null : v, page: 1 })}
      >
        <SelectTrigger className="h-8 w-28 text-xs">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="true">Enabled</SelectItem>
          <SelectItem value="false">Disabled</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear all */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-muted-foreground"
          onClick={() => {
            setSearchInput('')
            pushParams({ search: null, connectionId: null, target: null, enabled: null, page: 1 })
          }}
        >
          <X className="h-3 w-3" />
          Clear all
        </Button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Run ad-hoc */}
      {canUpdate && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setAdHocOpen(true)}
        >
          <Clock className="h-3.5 w-3.5" />
          Run ad-hoc
        </Button>
      )}

      {/* New schedule */}
      {canCreate && (
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5" />
          New schedule
        </Button>
      )}
    </div>
  )

  // ── Empty state ───────────────────────────────────────────────────────────
  const emptyMessage = 'No sync schedules yet. Use "New schedule" to create one.'

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cron Sync</h1>
          <p className="text-sm text-muted-foreground">
            Manage recurring sync schedules for your commerce connections.
          </p>
        </div>
      </div>

      {/* ── Info banner ───────────────────────────────────────────────────────── */}
      {!bannerDismissed && (
        <div className="flex items-start gap-3 rounded-[0.625rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800/40 dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 text-amber-800 dark:text-amber-300">
            Scheduled runs are not yet executed automatically — only &quot;Run now&quot; triggers a sync. A background worker will be added in a future release.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 p-0 text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400"
            onClick={() => {
              setBannerDismissed(true)
              localStorage.setItem(BANNER_KEY, '1')
            }}
            aria-label="Dismiss banner"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={rows}
        total={total}
        page={page}
        limit={limit}
        isLoading={isLoading}
        onPageChange={(p) => pushParams({ page: p })}
        onLimitChange={(l) => pushParams({ limit: l, page: 1 })}
        onSortChange={(s) => {
          if (!s) {
            pushParams({ sort: null, order: null })
          } else {
            pushParams({ sort: s.id, order: s.desc ? 'desc' : 'asc' })
          }
        }}
        toolbar={toolbar}
        emptyMessage={emptyMessage}
      />

      {/* ── Create/edit sheet ─────────────────────────────────────────────── */}
      <CronSyncSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={load}
        mode={sheetMode}
        schedule={editTarget}
      />

      {/* ── Run progress modal ────────────────────────────────────────────── */}
      <RunProgressModal
        open={progressOpen}
        jobId={progressJobId}
        onClose={() => {
          setProgressOpen(false)
          setProgressJobId(null)
        }}
      />

      {/* ── Ad-hoc modal ──────────────────────────────────────────────────── */}
      <RunAdHocModal
        open={adHocOpen}
        onOpenChange={setAdHocOpen}
        onJobStarted={handleAdHocJobStarted}
      />
    </div>
  )
}
