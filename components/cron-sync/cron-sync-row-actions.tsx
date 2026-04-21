'use client'

import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { useAbility } from '@/lib/acl/ability-context'
import type { SyncScheduleRow } from './cron-sync-columns'

interface Props {
  row: SyncScheduleRow
  onEdit: () => void
  onRunNow: () => void
  onToggleEnabled: () => void
  onDelete: () => void
}

export function CronSyncRowActions({ row, onEdit, onRunNow, onToggleEnabled, onDelete }: Props) {
  const ability = useAbility()
  const canUpdate = ability.can('update', 'SyncSchedule')
  const canDelete = ability.can('delete', 'SyncSchedule')

  return (
    <div className="flex items-center gap-1">
      {canUpdate && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onRunNow}
        >
          <Play className="h-3 w-3" />
          Run
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canUpdate && (
            <>
              <DropdownMenuItem onClick={onRunNow}>
                <Play className="h-3.5 w-3.5" />
                Run now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleEnabled}>
                {row.enabled ? 'Disable' : 'Enable'}
              </DropdownMenuItem>
            </>
          )}
          {canDelete && (
            <>
              {canUpdate && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant="destructive"
                onClick={onDelete}
              >
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
