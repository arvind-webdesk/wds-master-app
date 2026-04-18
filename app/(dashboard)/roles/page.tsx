'use client'

import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/data-table/DataTable'
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
import { createColumns, type RoleWithCounts } from '@/components/roles/role-columns'
import { RoleSheet } from '@/components/roles/role-sheet'
import { useAbility } from '@/lib/acl/ability-context'

export default function RolesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ability = useAbility()

  // Table state — synced to URL search params
  const [page, setPage] = useState(() => Number(searchParams.get('page') ?? 1))
  const [limit, setLimit] = useState(() => Number(searchParams.get('limit') ?? 20))
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [sort, setSort] = useState(searchParams.get('sort') ?? 'name')
  const [order, setOrder] = useState<'asc' | 'desc'>(
    (searchParams.get('order') as 'asc' | 'desc') ?? 'asc'
  )

  // Data state
  const [rows, setRows] = useState<RoleWithCounts[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editRole, setEditRole] = useState<RoleWithCounts | null>(null)

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<RoleWithCounts | null>(null)
  const [deletePending, startDelete] = useTransition()

  // Debounce search input
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState(search)

  function handleSearchChange(value: string) {
    setSearch(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (page !== 1) params.set('page', String(page))
    if (limit !== 20) params.set('limit', String(limit))
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sort !== 'name') params.set('sort', sort)
    if (order !== 'asc') params.set('order', order)
    const qs = params.toString()
    router.replace(`/roles${qs ? '?' + qs : ''}`, { scroll: false })
  }, [page, limit, debouncedSearch, sort, order, router])

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort,
        order,
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/roles?${params}`)
      const json = await res.json()
      if (res.ok) {
        setRows(json.data ?? [])
        setTotal(json.meta?.total ?? 0)
      } else {
        toast.error(json.error?.message ?? 'Failed to load roles')
      }
    } catch {
      toast.error('Failed to load roles')
    } finally {
      setIsLoading(false)
    }
  }, [page, limit, debouncedSearch, sort, order])

  useEffect(() => {
    load()
  }, [load])

  function handleSortChange(s: { id: string; desc: boolean } | null) {
    if (s) {
      setSort(s.id)
      setOrder(s.desc ? 'desc' : 'asc')
    } else {
      setSort('name')
      setOrder('asc')
    }
    setPage(1)
  }

  function openCreate() {
    setEditRole(null)
    setSheetOpen(true)
  }

  function openEdit(role: RoleWithCounts) {
    setEditRole(role)
    setSheetOpen(true)
  }

  function openManage(role: RoleWithCounts) {
    router.push(`/roles/${role.id}`)
  }

  function openDelete(role: RoleWithCounts) {
    setDeleteTarget(role)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    startDelete(async () => {
      const res = await fetch(`/api/roles/${deleteTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to delete role')
        setDeleteTarget(null)
        return
      }
      toast.success('Role deleted')
      setDeleteTarget(null)
      load()
    })
  }

  const columns = createColumns({
    onEdit: openEdit,
    onManage: openManage,
    onDelete: openDelete,
    can: ability.can.bind(ability),
  })

  const canCreate = ability.can('create', 'Role')

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            Roles
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage RBAC roles and their permission matrices.
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New Role
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
        onSortChange={handleSortChange}
        toolbar={
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search roles…"
              className="h-8 pl-8 text-xs rounded-md border-input"
            />
          </div>
        }
        emptyMessage={
          total === 0 && !debouncedSearch
            ? 'No roles yet'
            : 'No roles match your search'
        }
      />

      {/* Create / Edit Sheet */}
      <RoleSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setEditRole(null)
        }}
        editRole={editRole}
        onSuccess={load}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role?</AlertDialogTitle>
            <AlertDialogDescription>
              The role <strong>{deleteTarget?.name}</strong> will be permanently
              removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletePending}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePending}
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
