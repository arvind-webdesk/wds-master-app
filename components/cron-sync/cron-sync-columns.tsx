'use client'

import { ColumnDef } from '@tanstack/react-table'
import { formatDistanceToNow, parseISO } from 'date-fns'
import cronstrue from 'cronstrue'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { CronSyncRowActions } from './cron-sync-row-actions'

// ─── Types ──────────────────────────────────────────────────────────────────

export type SyncScheduleRow = {
  id: number
  connectionId: number
  target: 'products' | 'orders' | 'customers'
  cronExpression: string
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
  connection: { id: number; name: string; platform: string }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  try {
    return formatDistanceToNow(parseISO(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')), {
      addSuffix: true,
    })
  } catch {
    return iso
  }
}

function describeCron(expr: string): string {
  try {
    return cronstrue.toString(expr)
  } catch {
    return 'Invalid expression'
  }
}

function platformBadgeClass(platform: string): string {
  if (platform === 'shopify') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30'
  if (platform === 'bigcommerce') return 'bg-sky-50 text-sky-700 dark:bg-sky-950/30'
  return 'bg-muted text-muted-foreground'
}

function targetBadgeVariant(target: string): 'default' | 'secondary' | 'outline' {
  if (target === 'products') return 'default'
  if (target === 'orders') return 'secondary'
  return 'outline'
}

// ─── Column builder ─────────────────────────────────────────────────────────

export function buildColumns(opts: {
  onEdit: (row: SyncScheduleRow) => void
  onRunNow: (row: SyncScheduleRow) => void
  onToggleEnabled: (row: SyncScheduleRow) => void
  onDelete: (row: SyncScheduleRow) => void
  onRefresh: () => void
}): ColumnDef<SyncScheduleRow>[] {
  return [
    {
      id: 'connection',
      accessorFn: (r) => r.connection.name,
      header: 'Connection',
      enableSorting: true,
      cell: ({ row }) => {
        const conn = row.original.connection
        return (
          <div className="flex flex-col gap-0.5 min-w-0">
            <Link
              href={`/connections/${conn.id}`}
              className="font-medium text-foreground hover:underline truncate text-xs"
            >
              {conn.name}
            </Link>
            <span
              className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize ${platformBadgeClass(conn.platform)}`}
            >
              {conn.platform}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'target',
      header: 'Target',
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant={targetBadgeVariant(row.original.target)} className="capitalize text-[10px] py-0.5">
          {row.original.target}
        </Badge>
      ),
    },
    {
      accessorKey: 'cronExpression',
      header: 'Cron',
      enableSorting: false,
      cell: ({ row }) => {
        const expr = row.original.cronExpression
        const human = describeCron(expr)
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={<span className="font-mono text-xs text-foreground cursor-help" />}>
                {expr}
              </TooltipTrigger>
              <TooltipContent side="top">{human}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      id: 'cronHuman',
      header: 'Human-readable',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{describeCron(row.original.cronExpression)}</span>
      ),
    },
    {
      accessorKey: 'enabled',
      header: 'Enabled',
      enableSorting: true,
      cell: ({ row }) => (
        <Switch
          checked={row.original.enabled}
          onCheckedChange={() => opts.onToggleEnabled(row.original)}
          size="sm"
          aria-label={`Toggle schedule ${row.original.id}`}
        />
      ),
    },
    {
      accessorKey: 'lastRunAt',
      header: 'Last run',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{fmtRelative(row.original.lastRunAt)}</span>
      ),
    },
    {
      accessorKey: 'nextRunAt',
      header: 'Next run',
      enableSorting: true,
      cell: ({ row }) => {
        const val = fmtRelative(row.original.nextRunAt)
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={<span className="text-xs text-muted-foreground cursor-help" />}>
                {val}
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Informational only — no runner is active yet
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      size: 80,
      enableHiding: false,
      cell: ({ row }) => (
        <CronSyncRowActions
          row={row.original}
          onEdit={() => opts.onEdit(row.original)}
          onRunNow={() => opts.onRunNow(row.original)}
          onToggleEnabled={() => opts.onToggleEnabled(row.original)}
          onDelete={() => opts.onDelete(row.original)}
        />
      ),
    },
  ]
}
