/**
 * Client configuration — baked into the template, overwritten by
 * `scripts/apply-config.ts` when a client-specific `seed-data.json` is present.
 *
 * Do not hand-edit this file in a provisioned client repo: re-running the
 * onboarding apply step will regenerate it from seed-data.json.
 */

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
])

export function isModuleEnabled(key: string): boolean {
  return ENABLED_MODULES.has(key)
}
