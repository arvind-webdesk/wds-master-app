'use client'

import { Badge } from '@/components/ui/badge'
import type { ConnectionStatus } from '@/lib/db/schema/connections'

interface Props {
  status: ConnectionStatus
}

export function ConnectionStatusBadge({ status }: Props) {
  if (status === 'active') {
    return (
      <Badge
        className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
        variant="outline"
      >
        Active
      </Badge>
    )
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive">
        Error
      </Badge>
    )
  }
  return (
    <Badge variant="secondary">
      Disabled
    </Badge>
  )
}
