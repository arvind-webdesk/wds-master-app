/**
 * Client configuration — baked into the template, overwritten by
 * `scripts/apply-config.ts` when a client-specific `seed-data.json` is present.
 *
 * Do not hand-edit this file in a provisioned client repo: re-running the
 * onboarding apply step will regenerate it from seed-data.json.
 */

export type DashboardType = 'custom' | 'middleware' | 'saas'

/** Presets defined in components/shell/sidebar-themes.ts. */
export type SidebarTheme = 'light' | 'navy' | 'zoho' | 'slate' | 'neutral'

export interface SyncTargets {
  products:  boolean
  orders:    boolean
  customers: boolean
}

export interface IntegrationsConfig {
  shopify: {
    enabled:  boolean
    /** myshopify.com domain, no scheme. Empty string when disabled. */
    storeUrl: string
    sync:     SyncTargets
  }
  bigcommerce: {
    enabled:   boolean
    /** Short alphanumeric store hash. Empty string when disabled. */
    storeHash: string
    sync:      SyncTargets
  }
}

export interface ClientConfig {
  name:              string
  slug:              string
  adminEmail:        string
  adminFirstName:    string
  adminLastName:     string
  brandPrimaryColor: string          // hex, e.g. '#2563EB'
  brandLogoUrl:      string | null
  notes:             string | null
  provisionedAt:     string | null   // ISO 8601
  provisionedBy:     string | null
  dashboardType:     DashboardType
  /** Which sidebar color preset to use. Falls back to 'navy' if absent. */
  sidebarTheme:      SidebarTheme
  integrations:      IntegrationsConfig
}

/** Default config used before any onboarding data is applied. */
export const CLIENT_CONFIG: ClientConfig = {
  name:              'WDS Dashboard',
  slug:              'wds',
  adminEmail:        'admin@wds.local',
  adminFirstName:    'Super',
  adminLastName:     'Admin',
  brandPrimaryColor: '#2563EB',
  brandLogoUrl:      null,
  notes:             null,
  provisionedAt:     null,
  provisionedBy:     null,
  dashboardType:     'middleware',
  sidebarTheme:      'light',
  integrations: {
    shopify: {
      enabled:  true,
      storeUrl: 'example.myshopify.com',
      sync:     { products: true, orders: true, customers: true },
    },
    bigcommerce: {
      enabled:   true,
      storeHash: 'abc123',
      sync:      { products: true, orders: true, customers: true },
    },
  },
}

/**
 * Modules that are enabled for this client. Defaults to all — the apply-config
 * script narrows this set based on the onboarding form.
 */
export const ENABLED_MODULES: ReadonlySet<string> = new Set([
  'users',
  'roles',
  'email-templates',
  'activity-logs',
  'api-logs',
  'settings',
  'dashboard',
  'connections',
  'sync-history',
  'cron-sync',
])

export function isModuleEnabled(key: string): boolean {
  return ENABLED_MODULES.has(key)
}

/** Shorthand — true only when middleware is selected AND the platform is on. */
export function isIntegrationEnabled(platform: 'shopify' | 'bigcommerce'): boolean {
  return (
    CLIENT_CONFIG.dashboardType === 'middleware' &&
    CLIENT_CONFIG.integrations[platform].enabled
  )
}
