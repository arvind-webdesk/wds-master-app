'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
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
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'

// ─── Row type ─────────────────────────────────────────────────────────────────

export type EmailTemplateRow = {
  id: number
  title: string
  code: string
  subject: string
  body: string
  status: 'active' | 'inactive'
  allowTo: string | null
  emailType: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

// ─── Column meta ──────────────────────────────────────────────────────────────

interface ColumnMeta {
  canUpdate: boolean
  canDelete: boolean
  canSend: boolean
  onSendTest: (row: EmailTemplateRow) => void
  onDelete: (row: EmailTemplateRow) => void
}

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30)  return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Columns factory ──────────────────────────────────────────────────────────

export function buildColumns(meta: ColumnMeta): ColumnDef<EmailTemplateRow, unknown>[] {
  return [
    {
      accessorKey: 'title',
      header: 'Title',
      enableSorting: true,
      cell: ({ row }) => (
        <Link
          href={`/email-templates/${row.original.id}`}
          className="font-medium text-foreground hover:underline underline-offset-2"
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: 'code',
      header: 'Code',
      enableSorting: true,
      cell: ({ getValue }) => (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          {getValue() as string}
        </code>
      ),
    },
    {
      accessorKey: 'subject',
      header: 'Subject',
      enableSorting: false,
      cell: ({ getValue }) => {
        const full = getValue() as string
        const truncated = full.length > 60 ? full.slice(0, 60) + '…' : full
        if (full.length <= 60) return <span className="text-muted-foreground">{full}</span>
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="text-left">
                <span className="text-muted-foreground">{truncated}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="max-w-xs break-words">{full}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: true,
      cell: ({ getValue }) => {
        const s = getValue() as string
        return s === 'active' ? (
          <Badge
            variant="secondary"
            className="bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400"
          >
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Inactive
          </Badge>
        )
      },
    },
    {
      accessorKey: 'emailType',
      header: 'Type',
      enableSorting: true,
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? (
          <span className="text-muted-foreground">{v}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )
      },
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated',
      enableSorting: true,
      cell: ({ getValue }) => {
        const iso = getValue() as string
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="text-left">
                <span className="text-muted-foreground">{relativeTime(iso)}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {new Date(iso).toLocaleString()}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      size: 48,
      enableHiding: false,
      cell: ({ row }) => {
        const t = row.original
        const showSend = meta.canSend && t.status === 'active'

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
              {meta.canUpdate && (
                <DropdownMenuItem>
                  <Link href={`/email-templates/${t.id}`} className="w-full">
                    Edit
                  </Link>
                </DropdownMenuItem>
              )}
              {showSend && (
                <DropdownMenuItem onClick={() => meta.onSendTest(t)}>
                  Send test
                </DropdownMenuItem>
              )}
              {meta.canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => meta.onDelete(t)}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}
