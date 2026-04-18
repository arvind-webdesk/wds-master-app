'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable } from '@/components/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { buildColumns, type EmailTemplateRow } from '@/components/email-templates/email-templates-columns'
import { EmailTemplatesSheet } from '@/components/email-templates/email-templates-sheet'
import { SendTestDialog, type EmailPhrase } from '@/components/email-templates/send-test-dialog'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmailTemplatesPage() {
  const ability = useAbility()
  const router = useRouter()
  const searchParams = useSearchParams()

  const canRead   = ability.can('read',   'EmailTemplate')
  const canCreate = ability.can('create', 'EmailTemplate')
  const canUpdate = ability.can('update', 'EmailTemplate')
  const canDelete = ability.can('delete', 'EmailTemplate')
  const canSend   = ability.can('send',   'EmailTemplate')

  // ── URL-synced state ──
  const [page, setPage]       = useState(() => Number(searchParams.get('page')  ?? '1'))
  const [limit, setLimit]     = useState(() => Number(searchParams.get('limit') ?? '20'))
  const [search, setSearch]   = useState(() => searchParams.get('search') ?? '')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    () => (searchParams.get('status') as 'all' | 'active' | 'inactive') ?? 'all',
  )
  const [sort, setSort]   = useState(() => searchParams.get('sort')  ?? 'updatedAt')
  const [order, setOrder] = useState<'asc' | 'desc'>(
    () => (searchParams.get('order') as 'asc' | 'desc') ?? 'desc',
  )

  // ── Data state ──
  const [rows, setRows]       = useState<EmailTemplateRow[]>([])
  const [total, setTotal]     = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // ── Sheet ──
  const [sheetOpen, setSheetOpen] = useState(false)

  // ── Delete confirm ──
  const [deleteTarget, setDeleteTarget]   = useState<EmailTemplateRow | null>(null)
  const [actionPending, startAction]      = useTransition()

  // ── Send test ──
  const [sendTarget, setSendTarget]       = useState<EmailTemplateRow | null>(null)
  const [sendPhrases, setSendPhrases]     = useState<EmailPhrase[]>([])
  const [sendDialogOpen, setSendDialogOpen] = useState(false)

  // ── Debounced search ──
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState(search)

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [search])

  // ── Sync URL ──
  const syncUrl = useCallback(() => {
    const qs = new URLSearchParams()
    if (page > 1)               qs.set('page',   String(page))
    if (limit !== 20)           qs.set('limit',  String(limit))
    if (debouncedSearch)        qs.set('search', debouncedSearch)
    if (statusFilter !== 'all') qs.set('status', statusFilter)
    if (sort !== 'updatedAt')   qs.set('sort',   sort)
    if (order !== 'desc')       qs.set('order',  order)
    router.replace(`/email-templates?${qs.toString()}`, { scroll: false })
  }, [page, limit, debouncedSearch, statusFilter, sort, order, router])

  useEffect(() => { syncUrl() }, [syncUrl])

  // ── Fetch ──
  const load = useCallback(async () => {
    if (!canRead) return
    setIsLoading(true)
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), sort, order })
    if (debouncedSearch)        qs.set('search', debouncedSearch)
    if (statusFilter !== 'all') qs.set('status', statusFilter)

    try {
      const res  = await fetch(`/api/email-templates?${qs}`)
      const json = await res.json()
      if (res.ok) {
        setRows(json.data ?? [])
        setTotal(json.meta?.total ?? 0)
      } else {
        toast.error(json.error?.message ?? 'Failed to load email templates')
      }
    } catch {
      toast.error('Network error — could not load email templates')
    } finally {
      setIsLoading(false)
    }
  }, [page, limit, debouncedSearch, statusFilter, sort, order, canRead])

  useEffect(() => { load() }, [load])

  // ── Delete ──
  function handleDelete(row: EmailTemplateRow) {
    setDeleteTarget(row)
  }

  function executeDelete() {
    if (!deleteTarget) return
    const t = deleteTarget
    startAction(async () => {
      const res  = await fetch(`/api/email-templates/${t.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (res.ok) {
        toast.success(`"${t.title}" deleted`)
        load()
      } else {
        toast.error(json.error?.message ?? 'Delete failed')
      }
      setDeleteTarget(null)
    })
  }

  // ── Send test ──
  async function handleSendTest(row: EmailTemplateRow) {
    setSendTarget(row)
    // Fetch phrases for the override panel
    try {
      const res  = await fetch(`/api/email-templates/${row.id}/phrases`)
      const json = await res.json()
      setSendPhrases(res.ok ? (json.data ?? []) : [])
    } catch {
      setSendPhrases([])
    }
    setSendDialogOpen(true)
  }

  // ── Columns ──
  const columns = useMemo(
    () => buildColumns({ canUpdate, canDelete, canSend, onSendTest: handleSendTest, onDelete: handleDelete }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canUpdate, canDelete, canSend],
  )

  // ── Filters ──
  const statusOptions: Array<{ label: string; value: 'all' | 'active' | 'inactive' }> = [
    { label: 'All',      value: 'all' },
    { label: 'Active',   value: 'active' },
    { label: 'Inactive', value: 'inactive' },
  ]

  const hasActiveFilters = statusFilter !== 'all' || debouncedSearch !== ''
  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }

  // ── No access guard ──
  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <Mail className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Access restricted</p>
        <p className="text-xs text-muted-foreground">
          You do not have permission to view email templates.
        </p>
      </div>
    )
  }

  // ── Toolbar ──
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="h-8 pl-8 text-xs w-52"
        />
      </div>

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

      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="h-7 flex items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  )

  const emptyMessage = canCreate
    ? 'No email templates yet — create the first one using the "New template" button above.'
    : 'No email templates yet.'

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Email Templates</h1>
          <p className="text-sm text-muted-foreground">
            Manage email templates, phrases and test sends.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setSheetOpen(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            New template
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
          else   { setSort('updatedAt'); setOrder('desc') }
          setPage(1)
        }}
        toolbar={toolbar}
        emptyMessage={emptyMessage}
      />

      {/* Create Sheet */}
      <EmailTemplatesSheet open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Are you sure you want to delete{' '}
                  <strong>"{deleteTarget.title}"</strong>? This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={executeDelete}
              disabled={actionPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send test dialog */}
      <SendTestDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        templateId={sendTarget?.id ?? 0}
        phrases={sendPhrases}
      />
    </div>
  )
}
