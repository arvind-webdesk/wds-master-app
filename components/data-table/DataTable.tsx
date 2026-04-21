'use client'

import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useState } from 'react'
import { ChevronDown, ChevronsUpDown, ChevronUp, Columns3, SlidersHorizontal } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DataTableProps<TData> {
  /** Column definitions from @tanstack/react-table */
  columns: ColumnDef<TData, unknown>[]
  /** Current page data */
  data: TData[]
  /** Total row count (across all pages) */
  total?: number
  /** Current page (1-indexed) */
  page?: number
  /** Rows per page */
  limit?: number
  /** Loading skeleton */
  isLoading?: boolean
  /** Called when page changes */
  onPageChange?: (page: number) => void
  /** Called when limit changes */
  onLimitChange?: (limit: number) => void
  /** Called when sort changes: `{ id: columnId, desc: boolean } | null` */
  onSortChange?: (sort: { id: string; desc: boolean } | null) => void
  /** Slot rendered above the table (filter chips, action buttons, etc.) */
  toolbar?: React.ReactNode
  /** Empty state message */
  emptyMessage?: string
  /** Optional row click handler — makes rows appear clickable (cursor-pointer) */
  onRowClick?: (row: TData) => void
}

// ─── Component ─────────────────────────────────────────────────────────────

export function DataTable<TData>({
  columns,
  data,
  total = 0,
  page = 1,
  limit = 20,
  isLoading = false,
  onPageChange,
  onLimitChange,
  onSortChange,
  toolbar,
  emptyMessage = 'No results found.',
  onRowClick,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [compact, setCompact] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      setSorting(next)
      onSortChange?.(next[0] ? { id: next[0].id, desc: next[0].desc } : null)
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar row */}
      <div className="flex items-center gap-2">
        {/* Consumer-provided filters / search */}
        <div className="flex-1">{toolbar}</div>

        {/* Compact toggle */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setCompact((c) => !c)}
          aria-pressed={compact}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {compact ? 'Comfortable' : 'Compact'}
        </Button>

        {/* Column visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" />}>
            <Columns3 className="h-3.5 w-3.5" />
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  className="text-xs capitalize"
                  checked={col.getIsVisible()}
                  onCheckedChange={(v) => col.toggleVisibility(!!v)}
                >
                  {col.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-[0.625rem] border border-border overflow-hidden">
        <Table data-compact={compact ? '' : undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted  = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      className="text-xs font-medium text-muted-foreground h-9 px-3"
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc'  ? <ChevronUp   className="h-3 w-3" /> :
                           sorted === 'desc' ? <ChevronDown  className="h-3 w-3" /> :
                                               <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading ? (
              // Loading skeleton rows
              Array.from({ length: limit > 5 ? 5 : limit }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, ci) => (
                    <TableCell key={ci} className="px-3 py-2">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={`data-[compact]:py-0${onRowClick ? ' cursor-pointer' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="px-3 text-xs data-[compact]:py-1.5 py-2.5"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total === 0 ? 'No results' : (
            <>
              {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} results
            </>
          )}
        </span>

        <div className="flex items-center gap-1">
          {/* Rows per page */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-7 gap-1 text-xs" />}>
              {limit} / page
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {[10, 20, 50, 100].map((n) => (
                <DropdownMenuCheckboxItem
                  key={n}
                  className="text-xs"
                  checked={limit === n}
                  onCheckedChange={() => onLimitChange?.(n)}
                >
                  {n} per page
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Prev */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange?.(page - 1)}
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-90" />
          </Button>

          {/* Page indicator */}
          <span className="px-2 tabular-nums">
            {page} / {totalPages}
          </span>

          {/* Next */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange?.(page + 1)}
          >
            <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
          </Button>
        </div>
      </div>
    </div>
  )
}
