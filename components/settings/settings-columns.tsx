'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import type { Setting } from '@/lib/db/schema/settings'

interface SettingActionsProps {
  row: Setting
  canUpdate: boolean
  canDelete: boolean
  onEdit: (row: Setting) => void
  onDelete: (row: Setting) => void
}

function SettingActions({ row, canUpdate, canDelete, onEdit, onDelete }: SettingActionsProps) {
  if (!canUpdate && !canDelete) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
        aria-label="Row actions"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canUpdate && (
          <DropdownMenuItem onClick={() => onEdit(row)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(row)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function buildSettingsColumns(opts: {
  canUpdate: boolean
  canDelete: boolean
  onEdit: (row: Setting) => void
  onDelete: (row: Setting) => void
}): ColumnDef<Setting>[] {
  return [
    {
      accessorKey: 'key',
      header: 'Key',
      enableSorting: true,
      size: 260,
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-foreground">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'value',
      header: 'Value',
      enableSorting: false,
      cell: ({ getValue }) => {
        const v = getValue<string | null>()
        if (v === null || v === undefined) {
          return <span className="text-muted-foreground italic text-xs">null</span>
        }
        const truncated = v.length > 60 ? v.slice(0, 60) + '…' : v
        return (
          <span
            className="text-xs"
            title={v.length > 60 ? v : undefined}
          >
            {truncated}
          </span>
        )
      },
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated',
      enableSorting: true,
      size: 160,
      cell: ({ getValue }) => {
        const raw = getValue<string>()
        if (!raw) return <span className="text-muted-foreground text-xs">—</span>
        const date = new Date(raw)
        const now = Date.now()
        const diff = now - date.getTime()
        let rel: string
        if (diff < 60_000) rel = 'just now'
        else if (diff < 3_600_000) rel = `${Math.floor(diff / 60_000)}m ago`
        else if (diff < 86_400_000) rel = `${Math.floor(diff / 3_600_000)}h ago`
        else rel = date.toLocaleDateString()
        return <span className="text-xs text-muted-foreground">{rel}</span>
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      size: 48,
      cell: ({ row }) => (
        <SettingActions
          row={row.original}
          canUpdate={opts.canUpdate}
          canDelete={opts.canDelete}
          onEdit={opts.onEdit}
          onDelete={opts.onDelete}
        />
      ),
    },
  ]
}
