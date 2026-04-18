'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAbility } from '@/lib/acl/ability-context'
import { buildColumns, type UserRow } from '@/components/users/users-columns'
import { UsersSheet } from '@/components/users/users-sheet'

// ─── Confirm dialog state ─────────────────────────────────────────────────────

type ConfirmAction =
  | { type: 'delete'; user: UserRow }
  | { type: 'toggle'; user: UserRow }
  | null

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const ability = useAbility()
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── URL-synced state ──
  const [page, setPage] = useState(() => Number(searchParams.get('page') ?? '1'))
  const [limit, setLimit] = useState(() => Number(searchParams.get('limit') ?? '20'))
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    () => (searchParams.get('status') as 'all' | 'active' | 'inactive') ?? 'all',
  )
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'superadmin' | 'admin' | 'user'>(
    () =>
      (searchParams.get('userType') as 'all' | 'superadmin' | 'admin' | 'user') ?? 'all',
  )
  const [sort, setSort] = useState(() => searchParams.get('sort') ?? 'createdAt')
  const [order, setOrder] = useState<'asc' | 'desc'>(
    () => (searchParams.get('order') as 'asc' | 'desc') ?? 'desc',
  )

  // ── Data state ──
  const [rows, setRows] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // ── Sheet state ──
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserRow | null>(null)

  // ── Confirm dialog state ──
  const [confirm, setConfirm] = useState<ConfirmAction>(null)
  const [actionPending, startAction] = useTransition()

  // ── Debounced search ──
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState(search)

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [search])

  // ── Sync URL ──
  const syncUrl = useCallback(() => {
    const qs = new URLSearchParams()
    if (page > 1) qs.set('page', String(page))
    if (limit !== 20) qs.set('limit', String(limit))
    if (debouncedSearch) qs.set('search', debouncedSearch)
    if (statusFilter !== 'all') qs.set('status', statusFilter)
    if (userTypeFilter !== 'all') qs.set('userType', userTypeFilter)
    if (sort !== 'createdAt') qs.set('sort', sort)
    if (order !== 'desc') qs.set('order', order)
    router.replace(`/users?${qs.toString()}`, { scroll: false })
  }, [page, limit, debouncedSearch, statusFilter, userTypeFilter, sort, order, router])

  useEffect(() => {
    syncUrl()
  }, [syncUrl])

  // ── Fetch users ──
  const load = useCallback(async () => {
    setIsLoading(true)
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
      order,
    })
    if (debouncedSearch) qs.set('search', debouncedSearch)
    if (statusFilter !== 'all') qs.set('status', statusFilter)
    if (userTypeFilter !== 'all') qs.set('userType', userTypeFilter)

    try {
      const res = await fetch(`/api/users?${qs}`)
      const json = await res.json()
      if (res.ok) {
        setRows(json.data ?? [])
        setTotal(json.meta?.total ?? 0)
      } else {
        toast.error(json.error?.message ?? 'Failed to load users')
      }
    } catch {
      toast.error('Network error — could not load users')
    } finally {
      setIsLoading(false)
    }
  }, [page, limit, debouncedSearch, statusFilter, userTypeFilter, sort, order])

  useEffect(() => {
    load()
  }, [load])

  // ── CASL ──
  const canCreate = ability.can('create', 'User')
  const canUpdate = ability.can('update', 'User')
  const canDelete = ability.can('delete', 'User')
  const canActivate = ability.can('activate', 'User')

  // Placeholder: currentUserId not available from CASL alone.
  // We use 0 as fallback; real self-guard is enforced server-side.
  // Ideally the layout injects it; for now we read it from the first row's perspective.
  const currentUserId = 0

  // ── Column actions ──
  function handleEdit(user: UserRow) {
    setEditUser(user)
    setSheetOpen(true)
  }

  function handleToggleStatus(user: UserRow) {
    setConfirm({ type: 'toggle', user })
  }

  function handleDelete(user: UserRow) {
    setConfirm({ type: 'delete', user })
  }

  function handleNewUser() {
    setEditUser(null)
    setSheetOpen(true)
  }

  // ── Confirm: execute ──
  function executeConfirm() {
    if (!confirm) return
    if (confirm.type === 'delete') {
      const user = confirm.user
      startAction(async () => {
        const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
        const json = await res.json()
        if (res.ok) {
          toast.success(`${user.firstName} ${user.lastName} deleted`)
          load()
        } else {
          toast.error(json.error?.message ?? 'Delete failed')
        }
        setConfirm(null)
      })
    } else if (confirm.type === 'toggle') {
      const user = confirm.user
      const newStatus = user.status === 'active' ? 'inactive' : 'active'
      startAction(async () => {
        const res = await fetch(`/api/users/${user.id}/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
        const json = await res.json()
        if (res.ok) {
          toast.success(
            `${user.firstName} ${user.lastName} ${newStatus === 'active' ? 'activated' : 'deactivated'}`,
          )
          load()
        } else {
          toast.error(json.error?.message ?? 'Status update failed')
        }
        setConfirm(null)
      })
    }
  }

  // ── Columns (memoised so object references stay stable) ──
  const columns = useMemo(
    () =>
      buildColumns({
        currentUserId,
        canUpdate,
        canDelete,
        canActivate,
        onEdit: handleEdit,
        onToggleStatus: handleToggleStatus,
        onDelete: handleDelete,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canUpdate, canDelete, canActivate, currentUserId],
  )

  // ── Active filters check ──
  const hasActiveFilters = statusFilter !== 'all' || userTypeFilter !== 'all' || debouncedSearch !== ''

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setUserTypeFilter('all')
    setPage(1)
  }

  // ── Status filter chips ──
  const statusOptions: Array<{ label: string; value: 'all' | 'active' | 'inactive' }> = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
  ]

  const userTypeOptions: Array<{
    label: string
    value: 'all' | 'superadmin' | 'admin' | 'user'
  }> = [
    { label: 'All', value: 'all' },
    { label: 'Superadmin', value: 'superadmin' },
    { label: 'Admin', value: 'admin' },
    { label: 'User', value: 'user' },
  ]

  // ── Toolbar ──
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="h-8 pl-8 text-xs w-52"
        />
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-1">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setStatusFilter(opt.value); setPage(1) }}
            className={[
              'h-7 rounded-md px-2.5 text-xs font-medium transition-colors border',
              statusFilter === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* User-type chips */}
      <div className="flex items-center gap-1">
        {userTypeOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setUserTypeFilter(opt.value); setPage(1) }}
            className={[
              'h-7 rounded-md px-2.5 text-xs font-medium transition-colors border',
              userTypeFilter === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Clear all */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="h-7 flex items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
          Clear all
        </button>
      )}
    </div>
  )

  // ── Empty message with CTA ──
  const emptyMessage = canCreate
    ? 'No users yet — create the first one using the "New user" button above.'
    : 'No users yet.'

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage admin and staff user accounts.
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleNewUser} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            New user
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
          if (s) {
            setSort(s.id)
            setOrder(s.desc ? 'desc' : 'asc')
          } else {
            setSort('createdAt')
            setOrder('desc')
          }
          setPage(1)
        }}
        toolbar={toolbar}
        emptyMessage={emptyMessage}
      />

      {/* Create / Edit Sheet */}
      <UsersSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setEditUser(null)
        }}
        onSaved={load}
        mode={editUser ? 'edit' : 'create'}
        user={editUser}
      />

      {/* Confirm dialog — delete */}
      <AlertDialog
        open={confirm?.type === 'delete'}
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'delete' && (
                <>
                  Are you sure you want to delete{' '}
                  <strong>
                    {confirm.user.firstName} {confirm.user.lastName}
                  </strong>
                  ? This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={executeConfirm}
              disabled={actionPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm dialog — toggle status */}
      <AlertDialog
        open={confirm?.type === 'toggle'}
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === 'toggle' && confirm.user.status === 'active'
                ? 'Deactivate user'
                : 'Activate user'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'toggle' && (
                <>
                  {confirm.user.status === 'active'
                    ? `Deactivating ${confirm.user.firstName} ${confirm.user.lastName} will prevent them from signing in.`
                    : `Activating ${confirm.user.firstName} ${confirm.user.lastName} will restore their access.`}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeConfirm} disabled={actionPending}>
              {confirm?.type === 'toggle' && confirm.user.status === 'active'
                ? 'Deactivate'
                : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
