'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreHorizontal, Eye, Pencil, Zap, ToggleLeft, ToggleRight, Link2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAbility } from '@/lib/acl/ability-context'
import type { ConnectionRow } from './connections-columns'

interface Props {
  row: ConnectionRow
  onEdit: () => void
  onRefresh: () => void
}

export function ConnectionRowActions({ row, onEdit, onRefresh }: Props) {
  const ability = useAbility()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const canUpdate = ability.can('update', 'Connection')
  const canDelete = ability.can('delete', 'Connection')

  function handleTest() {
    startTransition(async () => {
      const res = await fetch(`/api/connections/${row.id}/test`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Test failed')
        return
      }
      if (json.data?.ok) {
        toast.success('Connection is healthy')
      } else {
        toast.error(`Connection error: ${json.data?.error ?? 'Unknown error'}`)
      }
      onRefresh()
    })
  }

  function handleToggleStatus() {
    startTransition(async () => {
      const newStatus = row.status === 'active' ? 'disabled' : 'active'
      const res = await fetch(`/api/connections/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to update status')
        return
      }
      toast.success(`Connection ${newStatus === 'active' ? 'enabled' : 'disabled'}`)
      onRefresh()
    })
  }

  function handleDelete() {
    if (!confirm(`Delete connection "${row.name}"? This action cannot be undone.`)) return
    startTransition(async () => {
      const res = await fetch(`/api/connections/${row.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to delete')
        return
      }
      toast.success('Connection deleted')
      onRefresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
        disabled={pending}
      >
        <MoreHorizontal className="h-4 w-4" />
        <span className="sr-only">Open actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => router.push(`/connections/${row.id}`)}>
          <Eye className="h-3.5 w-3.5" />
          View
        </DropdownMenuItem>

        {canUpdate && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
        )}

        {canUpdate && (
          <DropdownMenuItem onClick={handleTest}>
            <Zap className="h-3.5 w-3.5" />
            Test connection
          </DropdownMenuItem>
        )}

        {canUpdate && (
          <DropdownMenuItem onClick={handleToggleStatus}>
            {row.status === 'active' ? (
              <>
                <ToggleLeft className="h-3.5 w-3.5" />
                Disable
              </>
            ) : (
              <>
                <ToggleRight className="h-3.5 w-3.5" />
                Enable
              </>
            )}
          </DropdownMenuItem>
        )}

        {canUpdate && row.type === 'shopify' && (
          <DropdownMenuItem
            onClick={() => {
              window.location.href =
                `/api/connections/shopify/install?shop=${encodeURIComponent(row.storeIdentifier)}`
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
            Reconnect via OAuth
          </DropdownMenuItem>
        )}

        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
