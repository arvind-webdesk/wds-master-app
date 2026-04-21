'use client'

import { Badge } from '@/components/ui/badge'
import type { ConnectionType } from '@/lib/db/schema/connections'

interface Props {
  type: ConnectionType
}

export function ConnectionTypeBadge({ type }: Props) {
  if (type === 'shopify') {
    return (
      <Badge
        className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
        variant="outline"
      >
        Shopify
      </Badge>
    )
  }
  return (
    <Badge
      className="bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800"
      variant="outline"
    >
      BigCommerce
    </Badge>
  )
}
