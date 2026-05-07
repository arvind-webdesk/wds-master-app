/**
 * Dashboard view selection — drives which analytics view renders on /dashboard.
 *
 * To add a new middleware platform (e.g. 'woocommerce'):
 *   1. Extend `IntegrationsConfig` in lib/client-config.ts.
 *   2. Append the key to `MIDDLEWARE_PLATFORMS` below.
 *   3. Add a PLATFORM_META entry in lib/analytics/platform-meta.ts.
 * The helpers below pick it up automatically via the passed config.
 */

import type { ClientConfig } from '@/lib/client-config'

export type MiddlewarePlatform = 'shopify' | 'bigcommerce'

export type DashboardView = 'custom' | MiddlewarePlatform

/** All middleware platforms the app knows about — append-only. */
export const MIDDLEWARE_PLATFORMS: readonly MiddlewarePlatform[] = ['shopify', 'bigcommerce'] as const

/**
 * Views available for the dashboard switcher, in stable order.
 * - 'custom' dashboard type → only the custom view (no switcher).
 * - 'middleware' dashboard type → every enabled platform; falls back to
 *   ['custom'] if nothing is enabled.
 * - 'saas' dashboard type → custom view (reserved for future work).
 */
export function getAvailableDashboardViews(config: ClientConfig): DashboardView[] {
  if (config.dashboardType !== 'middleware') {
    return ['custom']
  }
  const enabled = MIDDLEWARE_PLATFORMS.filter(
    (p) => config.integrations[p].enabled,
  )
  return enabled.length > 0 ? enabled : ['custom']
}

/** Default view when the dashboard first renders — first entry of the available list. */
export function getDefaultDashboardView(config: ClientConfig): DashboardView {
  return getAvailableDashboardViews(config)[0]
}
