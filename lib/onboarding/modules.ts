/**
 * Catalog of modules the dashboard can show in its sidebar.
 *
 * The setup wizard uses this list to render checkboxes; the runtime
 * `getEnabledModules()` function (in lib/client-config.ts) reads the
 * `module_enablement` table and intersects with the keys defined here.
 *
 * `middlewareOnly` modules only make sense when dashboardType === 'middleware'.
 * The wizard hides them on the Features step otherwise.
 */
export interface OnboardingModule {
  key:             string
  displayName:     string
  description:     string
  middlewareOnly?: boolean
  /** Always-on modules cannot be turned off in the wizard. */
  required?:       boolean
}

export const ONBOARDING_MODULES: ReadonlyArray<OnboardingModule> = [
  { key: 'dashboard',       displayName: 'Dashboard',       description: 'Home page with KPIs and overview.', required: true },
  { key: 'users',           displayName: 'Users',           description: 'Invite and manage staff accounts.' },
  { key: 'roles',           displayName: 'Roles',           description: 'Define permission sets and assign them to users.' },
  { key: 'email-templates', displayName: 'Email Templates', description: 'Compose and send transactional emails.' },
  { key: 'activity-logs',   displayName: 'Activity Logs',   description: 'Audit trail of staff actions.' },
  { key: 'api-logs',        displayName: 'API Logs',        description: 'Trace incoming and outgoing API requests.' },
  { key: 'settings',        displayName: 'System Settings', description: 'Application-wide key/value configuration.' },
  { key: 'connections',     displayName: 'Connections',     description: 'Connect a Shopify or BigCommerce store.', middlewareOnly: true },
  { key: 'sync-history',    displayName: 'Sync History',    description: 'Audit every sync run from connected stores.', middlewareOnly: true },
  { key: 'cron-sync',       displayName: 'Cron Sync',       description: 'Schedule recurring syncs from connected stores.', middlewareOnly: true },
] as const

export const ONBOARDING_MODULE_KEYS: ReadonlySet<string> = new Set(
  ONBOARDING_MODULES.map((m) => m.key),
)

/** Modules that are forced on regardless of wizard input. */
export const REQUIRED_MODULE_KEYS: ReadonlyArray<string> = ONBOARDING_MODULES
  .filter((m) => m.required)
  .map((m) => m.key)
