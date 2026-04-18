'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, UserCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// SafeUser shape (mirrors API response — no password / resetPasswordToken)
export type UserRow = {
  id: number
  firstName: string
  lastName: string
  email: string
  contactNo: string | null
  image: string | null
  status: 'active' | 'inactive'
  userType: 'superadmin' | 'admin' | 'user'
  roleId: number | null
  portal: string | null
  createdAt: string
  updatedAt: string
  role?: { id: number; name: string } | null
}

interface ColumnMeta {
  currentUserId: number
  canUpdate: boolean
  canDelete: boolean
  canActivate: boolean
  onEdit: (user: UserRow) => void
  onToggleStatus: (user: UserRow) => void
  onDelete: (user: UserRow) => void
}

function initials(u: UserRow) {
  return `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase()
}

function userTypeBadgeVariant(t: string) {
  if (t === 'superadmin') return 'default' as const
  if (t === 'admin') return 'secondary' as const
  return 'outline' as const
}

export function buildColumns(meta: ColumnMeta): ColumnDef<UserRow, unknown>[] {
  return [
    {
      id: 'name',
      accessorFn: (row) => `${row.firstName} ${row.lastName}`,
      header: 'Name',
      enableSorting: true,
      cell: ({ row }) => {
        const u = row.original
        return (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar size="sm">
              {u.image && <AvatarImage src={u.image} alt={`${u.firstName} ${u.lastName}`} />}
              <AvatarFallback>{initials(u)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground leading-tight">
                {u.firstName} {u.lastName}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{getValue() as string}</span>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      enableSorting: false,
      cell: ({ row }) => {
        const role = row.original.role
        return role ? (
          <Badge variant="outline">{role.name}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      accessorKey: 'userType',
      header: 'User Type',
      enableSorting: true,
      cell: ({ getValue }) => {
        const t = getValue() as string
        return (
          <Badge variant={userTypeBadgeVariant(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Badge>
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
      accessorKey: 'createdAt',
      header: 'Created',
      enableSorting: true,
      cell: ({ getValue }) =>
        new Date(getValue() as string).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      size: 48,
      enableHiding: false,
      cell: ({ row }) => {
        const u = row.original
        const isSelf = u.id === meta.currentUserId
        const canDeactivate = meta.canActivate && !isSelf
        const canDel = meta.canDelete && !isSelf

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
                <DropdownMenuItem onClick={() => meta.onEdit(u)}>
                  Edit
                </DropdownMenuItem>
              )}
              {canDeactivate && (
                <DropdownMenuItem onClick={() => meta.onToggleStatus(u)}>
                  {u.status === 'active' ? 'Deactivate' : 'Activate'}
                </DropdownMenuItem>
              )}
              {/* Always show Activate for inactive, even if self (activate self is allowed — only deactivate self is blocked) */}
              {meta.canActivate && isSelf && u.status === 'inactive' && (
                <DropdownMenuItem onClick={() => meta.onToggleStatus(u)}>
                  Activate
                </DropdownMenuItem>
              )}
              {canDel && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => meta.onDelete(u)}
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
