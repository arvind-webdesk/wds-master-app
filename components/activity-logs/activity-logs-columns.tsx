'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityLogRow = {
  id: number
  userId: number | null
  action: string
  subjectType: string
  subjectId: number | null
  meta: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: number
    firstName: string
    lastName: string
    email: string
  } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Row action cell (needs router, so it's a component) ─────────────────────

function RowActions({ row }: { row: ActivityLogRow }) {
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
      >
        <MoreHorizontal className="h-4 w-4" />
        <span className="sr-only">Open actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-medium">Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(`/activity-logs/${row.id}`)}>
          View details
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Column definitions ───────────────────────────────────────────────────────

export const activityLogsColumns: ColumnDef<ActivityLogRow, unknown>[] = [
  {
    accessorKey: 'createdAt',
    header: 'When',
    enableSorting: true,
    cell: ({ getValue }) => {
      const iso = getValue() as string
      const abs = new Date(iso).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      return (
        <span title={abs} className="tabular-nums whitespace-nowrap text-muted-foreground">
          {relativeTime(iso)}
        </span>
      )
    },
  },
  {
    id: 'user',
    header: 'Actor',
    enableSorting: false,
    cell: ({ row }) => {
      const u = row.original.user
      if (!u) {
        return <span className="text-muted-foreground italic">System</span>
      }
      return (
        <div className="min-w-0">
          <p className="font-medium text-foreground leading-tight truncate">
            {u.firstName} {u.lastName}
          </p>
          <p className="text-muted-foreground truncate text-xs">{u.email}</p>
        </div>
      )
    },
  },
  {
    accessorKey: 'action',
    header: 'Action',
    enableSorting: true,
    cell: ({ getValue }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
        {getValue() as string}
      </code>
    ),
  },
  {
    id: 'subject',
    header: 'Subject',
    enableSorting: false,
    cell: ({ row }) => {
      const { subjectType, subjectId } = row.original
      if (subjectType === 'System') {
        return <span className="text-muted-foreground">—</span>
      }
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="font-mono text-xs">
            {subjectType}
          </Badge>
          {subjectId != null && (
            <span className="text-muted-foreground text-xs">#{subjectId}</span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'ip',
    header: 'IP',
    enableSorting: false,
    cell: ({ getValue }) => {
      const ip = getValue() as string | null
      if (!ip) return <span className="text-muted-foreground">—</span>
      return (
        <span title={ip} className="font-mono text-xs truncate max-w-[120px] block" >
          {ip}
        </span>
      )
    },
  },
  {
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    size: 48,
    enableHiding: false,
    cell: ({ row }) => <RowActions row={row.original} />,
  },
]
