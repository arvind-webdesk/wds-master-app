'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink } from 'lucide-react'

// ─── List-item type ─────────────────────────────────────────────────────────

export interface ApiLogListItem {
  id: number
  createdAt: string
  method: string | null
  url: string | null
  responseStatus: number | null
  durationMs: number | null
  isError: boolean
  errorType: string | null
  source: string | null
  environment: string | null
  ip: string | null
  logType: string | null
  message: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function methodBadgeClass(method: string | null): string {
  switch (method?.toUpperCase()) {
    case 'GET':     return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    case 'POST':    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    case 'PUT':
    case 'PATCH':   return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
    case 'DELETE':  return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
    default:        return 'bg-muted text-muted-foreground'
  }
}

function statusBadgeClass(status: number | null): string {
  if (status === null) return 'bg-muted text-muted-foreground'
  if (status >= 500) return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
  if (status >= 400) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
  if (status >= 300) return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
  if (status >= 200) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
  return 'bg-muted text-muted-foreground'
}

function envBadgeClass(env: string | null): string {
  switch (env?.toLowerCase()) {
    case 'production': return 'border border-rose-300 text-rose-600 dark:border-rose-700 dark:text-rose-400'
    case 'development': return 'border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-400'
    default: return 'border border-border text-muted-foreground'
  }
}

// ─── Columns factory ─────────────────────────────────────────────────────────

export function buildApiLogsColumns(
  onViewRow: (id: number) => void,
): ColumnDef<ApiLogListItem, unknown>[] {
  return [
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: 'Time',
      enableHiding: false,
      enableSorting: true,
      cell: ({ row }) => {
        const val = row.original.createdAt
        return (
          <span
            className="text-xs text-muted-foreground tabular-nums whitespace-nowrap"
            title={val}
          >
            {relativeTime(val)}
          </span>
        )
      },
    },
    {
      id: 'method',
      accessorKey: 'method',
      header: 'Method',
      enableHiding: true,
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original.method
        return m ? (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono uppercase ${methodBadgeClass(m)}`}
          >
            {m}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      id: 'url',
      accessorKey: 'url',
      header: 'URL',
      enableHiding: false,
      enableSorting: false,
      size: 320,
      cell: ({ row }) => {
        const url = row.original.url
        return url ? (
          <button
            type="button"
            className="flex items-center gap-1 text-left font-mono text-xs text-foreground hover:text-accent-foreground truncate max-w-[280px] group"
            title={url}
            onClick={() => onViewRow(row.original.id)}
          >
            <span className="truncate">{url}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        ) : (
          <span className="text-muted-foreground font-mono text-xs">—</span>
        )
      },
    },
    {
      id: 'responseStatus',
      accessorKey: 'responseStatus',
      header: 'Status',
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const s = row.original.responseStatus
        return s !== null ? (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${statusBadgeClass(s)}`}
          >
            {s}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )
      },
    },
    {
      id: 'durationMs',
      accessorKey: 'durationMs',
      header: 'Duration',
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const d = row.original.durationMs
        return d !== null ? (
          <span className="text-xs tabular-nums text-right block">{d} ms</span>
        ) : (
          <span className="text-muted-foreground text-xs text-right block">—</span>
        )
      },
    },
    {
      id: 'isError',
      accessorKey: 'isError',
      header: 'Error',
      enableHiding: true,
      enableSorting: false,
      cell: ({ row }) => {
        const { isError, errorType } = row.original
        return isError ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
            <span className="text-xs text-rose-600 dark:text-rose-400 truncate max-w-[120px]" title={errorType ?? undefined}>
              {errorType ?? 'Error'}
            </span>
          </span>
        ) : null
      },
    },
    {
      id: 'source',
      accessorKey: 'source',
      header: 'Source',
      enableHiding: true,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.source ?? '—'}</span>
      ),
    },
    {
      id: 'environment',
      accessorKey: 'environment',
      header: 'Env',
      enableHiding: true,
      enableSorting: false,
      // hidden by default — DataTable VisibilityState handles this at the page level
      cell: ({ row }) => {
        const env = row.original.environment
        return env ? (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-transparent ${envBadgeClass(env)}`}
          >
            {env}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )
      },
    },
    {
      id: 'ip',
      accessorKey: 'ip',
      header: 'IP',
      enableHiding: true,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">{row.original.ip ?? '—'}</span>
      ),
    },
    {
      id: 'logType',
      accessorKey: 'logType',
      header: 'Type',
      enableHiding: true,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.logType ?? '—'}</span>
      ),
    },
  ]
}
