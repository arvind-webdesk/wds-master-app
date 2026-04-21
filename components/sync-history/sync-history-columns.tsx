'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreHorizontal } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SyncRunListItem {
  id: number
  platform: string
  target: string
  status: string
  recordsSeen: number
  recordsUpserted: number
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  connectionId: number | null
  connectionName: string | null
  triggeredBy: number | null
  triggeredByLabel: string | null
  hasError: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso.replace(' ', 'T')).getTime()
  const s = Math.floor(Math.abs(diff) / 1000)
  if (s < 60)   return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 5000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function platformBadge(platform: string) {
  switch (platform.toLowerCase()) {
    case 'shopify':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    case 'bigcommerce':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function platformLabel(platform: string) {
  switch (platform.toLowerCase()) {
    case 'shopify':     return 'Shopify'
    case 'bigcommerce': return 'BigCommerce'
    default:            return platform
  }
}

function targetBadge(_target: string) {
  return 'bg-muted text-muted-foreground'
}

function statusBadge(status: string): { cls: string; dot?: string } {
  switch (status) {
    case 'ok':
      return { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' }
    case 'failed':
      return { cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400' }
    case 'running':
      return {
        cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
        dot: 'bg-amber-500 animate-pulse',
      }
    default:
      return { cls: 'bg-muted text-muted-foreground' }
  }
}

// ─── Columns factory ─────────────────────────────────────────────────────────

export function buildSyncHistoryColumns(
  currentQS: string,
): ColumnDef<SyncRunListItem, unknown>[] {
  return [
    // startedAt — not hideable per spec
    {
      id: 'startedAt',
      accessorKey: 'startedAt',
      header: 'Started',
      enableHiding: false,
      enableSorting: true,
      cell: ({ row }) => {
        const val = row.original.startedAt
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

    // connectionName
    {
      id: 'connectionName',
      accessorKey: 'connectionName',
      header: 'Connection',
      enableHiding: true,
      enableSorting: false,
      cell: ({ row }) => {
        const { connectionName, connectionId } = row.original
        if (!connectionName) {
          return <span className="text-xs text-muted-foreground">(legacy)</span>
        }
        return (
          <Link
            href={`/connections/${connectionId}`}
            className="text-xs text-foreground hover:underline flex items-center gap-1 group"
            onClick={(e) => e.stopPropagation()}
          >
            {connectionName}
            <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
          </Link>
        )
      },
    },

    // platform
    {
      id: 'platform',
      accessorKey: 'platform',
      header: 'Platform',
      enableHiding: true,
      enableSorting: false,
      cell: ({ row }) => {
        const p = row.original.platform
        return (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${platformBadge(p)}`}
          >
            {platformLabel(p)}
          </span>
        )
      },
    },

    // target
    {
      id: 'target',
      accessorKey: 'target',
      header: 'Target',
      enableHiding: true,
      enableSorting: false,
      cell: ({ row }) => {
        const t = row.original.target
        return (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] capitalize ${targetBadge(t)}`}
          >
            {t}
          </span>
        )
      },
    },

    // status — not hideable per spec
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      enableHiding: false,
      enableSorting: true,
      cell: ({ row }) => {
        const s = row.original.status
        const { cls, dot } = statusBadge(s)
        return (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
            {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot} shrink-0`} />}
            {s === 'ok' ? 'OK' : s.charAt(0).toUpperCase() + s.slice(1)}
          </span>
        )
      },
    },

    // durationMs
    {
      id: 'durationMs',
      accessorKey: 'durationMs',
      header: 'Duration',
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const d = row.original.durationMs
        const text = formatDuration(d)
        const isMuted = d === null
        return (
          <span className={`text-xs tabular-nums text-right block ${isMuted ? 'text-muted-foreground' : ''}`}>
            {text}
          </span>
        )
      },
    },

    // recordsSeen
    {
      id: 'recordsSeen',
      accessorKey: 'recordsSeen',
      header: 'Seen',
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums text-right block">
          {row.original.recordsSeen.toLocaleString()}
        </span>
      ),
    },

    // recordsUpserted
    {
      id: 'recordsUpserted',
      accessorKey: 'recordsUpserted',
      header: 'Upserted',
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums text-right block">
          {row.original.recordsUpserted.toLocaleString()}
        </span>
      ),
    },

    // triggeredByLabel — hidden by default handled via initial columnVisibility in page
    {
      id: 'triggeredByLabel',
      accessorKey: 'triggeredByLabel',
      header: 'Triggered by',
      enableHiding: true,
      enableSorting: false,
      cell: ({ row }) => {
        const label = row.original.triggeredByLabel
        return label
          ? <span className="text-xs">{label}</span>
          : <span className="text-xs text-muted-foreground">System</span>
      },
    },

    // actions
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      size: 40,
      enableHiding: false,
      enableSorting: false,
      cell: function ActionsCell({ row }) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const router = useRouter()
        const id = row.original.id
        const href = currentQS
          ? `/sync-history/${id}?from=${encodeURIComponent(`/sync-history?${currentQS}`)}`
          : `/sync-history/${id}`

        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(href) }}>
                View details
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}
