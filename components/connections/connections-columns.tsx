'use client'

import { ColumnDef } from '@tanstack/react-table'
import { formatDistanceToNow, parseISO } from 'date-fns'
import type { SafeConnection } from '@/lib/db/schema/connections'
import { ConnectionTypeBadge } from './connection-type-badge'
import { ConnectionStatusBadge } from './connection-status-badge'
import { ConnectionRowActions } from './connections-row-actions'

export type ConnectionRow = SafeConnection

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  try {
    return formatDistanceToNow(parseISO(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z')), { addSuffix: true })
  } catch {
    return iso
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

export function buildColumns(opts: {
  onEdit: (row: ConnectionRow) => void
  onRefresh: () => void
}): ColumnDef<ConnectionRow>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      enableSorting: true,
      cell: ({ row }) => <ConnectionTypeBadge type={row.original.type as 'shopify' | 'bigcommerce'} />,
    },
    {
      accessorKey: 'storeIdentifier',
      header: 'Store',
      enableSorting: false,
      cell: ({ row }) => {
        const id = row.original.storeIdentifier
        if (row.original.type === 'shopify') {
          return (
            <a
              href={`https://${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-primary hover:underline"
            >
              {id}
            </a>
          )
        }
        return <span className="font-mono text-xs text-foreground">{id}</span>
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: true,
      cell: ({ row }) => (
        <ConnectionStatusBadge status={row.original.status as 'active' | 'disabled' | 'error'} />
      ),
    },
    {
      accessorKey: 'lastSyncAt',
      header: 'Last Sync',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{fmtRelative(row.original.lastSyncAt)}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{fmtDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      size: 48,
      enableHiding: false,
      cell: ({ row }) => (
        <ConnectionRowActions
          row={row.original}
          onEdit={() => opts.onEdit(row.original)}
          onRefresh={opts.onRefresh}
        />
      ),
    },
  ]
}
