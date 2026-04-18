'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, ShieldCheck, Users } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
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
import type { AppAbility } from '@/lib/acl/ability'

export type RoleWithCounts = {
  id: number
  name: string
  description: string | null
  userCount: number
  permissionCount: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface ColumnHandlers {
  onEdit: (row: RoleWithCounts) => void
  onManage: (row: RoleWithCounts) => void
  onDelete: (row: RoleWithCounts) => void
  can: AppAbility['can']
}

export function createColumns({
  onEdit,
  onManage,
  onDelete,
  can,
}: ColumnHandlers): ColumnDef<RoleWithCounts>[] {
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
      accessorKey: 'description',
      header: 'Description',
      enableSorting: false,
      cell: ({ row }) => {
        const desc = row.original.description
        if (!desc) return <span className="text-muted-foreground">—</span>
        return (
          <span className="text-muted-foreground">
            {desc.length > 80 ? desc.slice(0, 80) + '…' : desc}
          </span>
        )
      },
    },
    {
      accessorKey: 'userCount',
      header: 'Users',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant="secondary" className="gap-1">
          <Users className="h-3 w-3" />
          {row.original.userCount}
        </Badge>
      ),
    },
    {
      accessorKey: 'permissionCount',
      header: 'Permissions',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          {row.original.permissionCount}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      enableSorting: true,
      enableHiding: true,
      cell: ({ row }) => {
        try {
          return (
            <span className="text-muted-foreground">
              {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
            </span>
          )
        } catch {
          return <span className="text-muted-foreground">—</span>
        }
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      size: 48,
      enableHiding: false,
      cell: ({ row }) => {
        const role = row.original
        const isSuperadmin = role.name.toLowerCase() === 'superadmin'
        const hasUsers = role.userCount > 0
        const canUpdate = can('update', 'Role')
        const canDelete = can('delete', 'Role')

        if (!canUpdate && !canDelete) return null

        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-medium">{role.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canUpdate && (
                <>
                  <DropdownMenuItem onClick={() => onEdit(role)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onManage(role)}>
                    Manage permissions
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isSuperadmin || hasUsers}
                  onClick={() => {
                    if (!isSuperadmin && !hasUsers) onDelete(role)
                  }}
                  title={
                    isSuperadmin
                      ? 'Cannot delete the superadmin role'
                      : hasUsers
                      ? 'Reassign users first'
                      : undefined
                  }
                >
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}
