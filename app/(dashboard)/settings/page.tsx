'use client'

import { useState, useEffect, useCallback, useTransition, useRef } from 'react'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { useAbility } from '@/lib/acl/ability-context'
import { DataTable } from '@/components/data-table/DataTable'
import { buildSettingsColumns } from '@/components/settings/settings-columns'
import { SettingsSheet } from '@/components/settings/settings-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import type { Setting } from '@/lib/db/schema/settings'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListResponse {
  data: Setting[]
  meta: { page: number; limit: number; total: number }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const ability = useAbility()
  const canRead   = ability.can('read',   'Setting')
  const canUpdate = ability.can('update', 'Setting')
  const canDelete = ability.can('delete', 'Setting')

  // Table state
  const [rows, setRows]         = useState<Setting[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [limit, setLimit]       = useState(20)
  const [search, setSearch]     = useState('')
  const [sort, setSort]         = useState<{ id: string; desc: boolean } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editRow, setEditRow]     = useState<Setting | undefined>(undefined)

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<Setting | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()

  // Debounced search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [search])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!canRead) return
    setIsLoading(true)
    try {
      const qs = new URLSearchParams({
        page:  String(page),
        limit: String(limit),
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(sort && { sort: sort.id, order: sort.desc ? 'desc' : 'asc' }),
      })
      const res = await fetch(`/api/settings?${qs}`)
      if (!res.ok) throw new Error('Failed to load settings')
      const json: ListResponse = await res.json()
      setRows(json.data)
      setTotal(json.meta.total)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setIsLoading(false)
    }
  }, [canRead, page, limit, debouncedSearch, sort])

  useEffect(() => { load() }, [load])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleEdit(row: Setting) {
    setEditRow(row)
    setSheetOpen(true)
  }

  function handleNewSetting() {
    setEditRow(undefined)
    setSheetOpen(true)
  }

  function handleDelete(row: Setting) {
    setDeleteTarget(row)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    startDeleteTransition(async () => {
      const encodedKey = encodeURIComponent(deleteTarget.key)
      const res = await fetch(`/api/settings/${encodedKey}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error?.message ?? 'Failed to delete setting.')
        return
      }
      toast.success('Setting deleted.')
      setDeleteTarget(null)
      load()
    })
  }

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns = buildSettingsColumns({
    canUpdate,
    canDelete,
    onEdit:   handleEdit,
    onDelete: handleDelete,
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <SlidersHorizontal className="h-10 w-10 opacity-40" />
        <p className="text-sm font-medium">You don't have permission to view settings.</p>
      </div>
    )
  }

  const toolbar = (
    <div className="flex items-center gap-2 flex-1">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search keys or values…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>
      {canUpdate && (
        <Button size="sm" className="h-8 gap-1.5" onClick={handleNewSetting}>
          <Plus className="h-3.5 w-3.5" />
          New setting
        </Button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">System Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage application-wide key/value configuration.
          </p>
        </div>
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
        onSortChange={setSort}
        toolbar={toolbar}
        emptyMessage="No settings yet."
      />

      {/* Create / Edit sheet */}
      <SettingsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        row={editRow}
        onSuccess={load}
      />

      {/* Delete confirm dialog */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete setting</AlertDialogTitle>
            <AlertDialogDescription>
              Delete setting &ldquo;{deleteTarget?.key}&rdquo;? This can be restored by re-adding the key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePending}
              onClick={confirmDelete}
            >
              {deletePending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
