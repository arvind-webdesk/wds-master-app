import { ShoppingBag, Store } from 'lucide-react'
import type { MiddlewarePlatform } from '@/lib/analytics/dashboard-view'

export interface PlatformMeta {
  key:         MiddlewarePlatform
  label:       string
  icon:        React.ElementType
  accentColor: string
  currencyFallback: string
}

export const PLATFORM_META: Record<MiddlewarePlatform, PlatformMeta> = {
  shopify: {
    key:   'shopify',
    label: 'Shopify',
    icon:  ShoppingBag,
    accentColor: 'oklch(0.65 0.17 150)',
    currencyFallback: 'USD',
  },
  bigcommerce: {
    key:   'bigcommerce',
    label: 'BigCommerce',
    icon:  Store,
    accentColor: 'oklch(0.60 0.20 260)',
    currencyFallback: 'USD',
  },
}

export function getPlatformMeta(platform: MiddlewarePlatform): PlatformMeta {
  return PLATFORM_META[platform]
}
