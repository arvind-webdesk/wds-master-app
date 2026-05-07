/**
 * Runtime client-config helpers — DB-backed, hand-written.
 *
 * The auto-generated `lib/client-config.ts` re-exports everything from this
 * file so callers can do `import { getClientConfig, ... } from '@/lib/client-config'`.
 * Keeping the runtime helpers in a separate file means `pnpm apply:config`
 * (which rewrites `lib/client-config.ts`) doesn't clobber them.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clientConfig as clientConfigTable }    from '@/lib/db/schema/client-config'
import { moduleEnablement }                     from '@/lib/db/schema/module-enablement'
import { integrationConfig }                    from '@/lib/db/schema/integration-config'
import { projectPlanning }                      from '@/lib/db/schema/project-planning'
import { scopeDocuments, type ScopeDocument }   from '@/lib/db/schema/scope-documents'
import {
  STATIC_CLIENT_CONFIG,
  ENABLED_MODULES as STATIC_ENABLED_MODULES,
  type DashboardType,
  type SidebarTheme,
  type SyncTargets,
  type IntegrationsConfig,
} from '@/lib/client-config'
import { ONBOARDING_MODULE_KEYS } from '@/lib/onboarding/modules'

// ─── Runtime ClientConfig — superset of static seed + wizard-driven fields ──

export interface ClientConfig {
  // Identity / metadata
  name:                string
  slug:                string
  industry:            string | null
  country:             string | null
  timezone:            string

  // Branding
  brandPrimaryColor:   string
  brandSecondaryColor: string | null
  brandFontFamily:     string | null
  brandLogoUrl:        string | null
  brandFaviconUrl:     string | null
  sidebarTheme:        SidebarTheme

  // Dashboard shape
  dashboardType:       DashboardType

  // Free-form
  notes:               string | null

  // Wizard lifecycle
  completedAt:         string | null
  completedBy:         number | null

  // Integrations (joined from integration_config)
  integrations:        IntegrationsConfig
}

export interface ProjectPlanning {
  startDate:    string | null
  milestones:   Array<{ id: string; name: string; dueDate: string | null; description: string | null }>
  deliverables: Array<{ id: string; text: string }>
  notes:        string | null
}

// ─── getClientConfig ────────────────────────────────────────────────────────

/**
 * Returns the live dashboard config — DB row #1 of `client_config`, joined
 * with `integration_config` rows. Falls back to the static seed snapshot for
 * any field that hasn't been written yet (fresh install, before the wizard
 * has been opened).
 */
export async function getClientConfig(): Promise<ClientConfig> {
  const [row] = await db
    .select()
    .from(clientConfigTable)
    .where(eq(clientConfigTable.id, 1))
    .limit(1)

  const integrations = await loadIntegrations()

  if (!row) {
    return {
      name:                STATIC_CLIENT_CONFIG.name,
      slug:                STATIC_CLIENT_CONFIG.slug,
      industry:            null,
      country:             null,
      timezone:            'Etc/UTC',
      brandPrimaryColor:   STATIC_CLIENT_CONFIG.brandPrimaryColor,
      brandSecondaryColor: null,
      brandFontFamily:     STATIC_CLIENT_CONFIG.fontFamily,
      brandLogoUrl:        STATIC_CLIENT_CONFIG.brandLogoUrl,
      brandFaviconUrl:     null,
      sidebarTheme:        STATIC_CLIENT_CONFIG.sidebarTheme,
      dashboardType:       STATIC_CLIENT_CONFIG.dashboardType,
      notes:               STATIC_CLIENT_CONFIG.notes,
      completedAt:         null,
      completedBy:         null,
      integrations,
    }
  }

  return {
    name:                row.name || STATIC_CLIENT_CONFIG.name,
    slug:                row.slug || STATIC_CLIENT_CONFIG.slug,
    industry:            row.industry,
    country:             row.country,
    timezone:            row.timezone,
    brandPrimaryColor:   row.brandPrimaryColor,
    brandSecondaryColor: row.brandSecondaryColor,
    brandFontFamily:     row.brandFontFamily ?? STATIC_CLIENT_CONFIG.fontFamily,
    brandLogoUrl:        row.brandLogoUrl ?? STATIC_CLIENT_CONFIG.brandLogoUrl,
    brandFaviconUrl:     row.brandFaviconUrl,
    sidebarTheme:        narrowSidebarTheme(row.sidebarTheme),
    dashboardType:       narrowDashboardType(row.dashboardType),
    notes:               row.notes,
    completedAt:         row.completedAt,
    completedBy:         row.completedBy,
    integrations,
  }
}

// ─── getEnabledModules ──────────────────────────────────────────────────────

/**
 * Returns the set of module keys the wizard has turned on. Filtered through
 * the canonical list in `lib/onboarding/modules.ts` so unknown DB rows are
 * ignored. If the DB has no rows yet, we return the static `ENABLED_MODULES`
 * baked at seed time.
 */
export async function getEnabledModules(): Promise<ReadonlySet<string>> {
  const rows = await db
    .select({ moduleKey: moduleEnablement.moduleKey, enabled: moduleEnablement.enabled })
    .from(moduleEnablement)

  if (rows.length === 0) {
    return STATIC_ENABLED_MODULES
  }

  const enabled = new Set<string>()
  for (const r of rows) {
    if (r.enabled && ONBOARDING_MODULE_KEYS.has(r.moduleKey)) {
      enabled.add(r.moduleKey)
    }
  }
  return enabled
}

// ─── getProjectPlanning ─────────────────────────────────────────────────────

export async function getProjectPlanning(): Promise<ProjectPlanning> {
  const [row] = await db
    .select()
    .from(projectPlanning)
    .where(eq(projectPlanning.id, 1))
    .limit(1)

  if (!row) {
    return { startDate: null, milestones: [], deliverables: [], notes: null }
  }

  return {
    startDate:    row.startDate,
    milestones:   safeJson<ProjectPlanning['milestones']>(row.milestones, []),
    deliverables: safeJson<ProjectPlanning['deliverables']>(row.deliverables, []),
    notes:        row.notes,
  }
}

// ─── getScopeDocuments ──────────────────────────────────────────────────────

export async function getScopeDocuments(): Promise<ScopeDocument[]> {
  return db
    .select()
    .from(scopeDocuments)
    .where(eq(scopeDocuments.deletedAt, null as unknown as string))
}

// ─── Internals ──────────────────────────────────────────────────────────────

async function loadIntegrations(): Promise<IntegrationsConfig> {
  const rows = await db.select().from(integrationConfig)
  const byPlatform = new Map(rows.map((r) => [r.platform, r]))

  const shopifyRow     = byPlatform.get('shopify')
  const bigcommerceRow = byPlatform.get('bigcommerce')

  return {
    shopify: {
      enabled:  shopifyRow?.enabled ?? STATIC_CLIENT_CONFIG.integrations.shopify.enabled,
      storeUrl: shopifyRow?.storeUrl ?? STATIC_CLIENT_CONFIG.integrations.shopify.storeUrl,
      sync:     shopifyRow
        ? toSyncTargets(shopifyRow)
        : STATIC_CLIENT_CONFIG.integrations.shopify.sync,
    },
    bigcommerce: {
      enabled:   bigcommerceRow?.enabled ?? STATIC_CLIENT_CONFIG.integrations.bigcommerce.enabled,
      storeHash: bigcommerceRow?.storeHash ?? STATIC_CLIENT_CONFIG.integrations.bigcommerce.storeHash,
      sync:      bigcommerceRow
        ? toSyncTargets(bigcommerceRow)
        : STATIC_CLIENT_CONFIG.integrations.bigcommerce.sync,
    },
  }
}

function toSyncTargets(row: { syncProducts: boolean; syncOrders: boolean; syncCustomers: boolean }): SyncTargets {
  return {
    products:  row.syncProducts,
    orders:    row.syncOrders,
    customers: row.syncCustomers,
  }
}

function narrowSidebarTheme(v: string): SidebarTheme {
  if (v === 'navy' || v === 'zoho' || v === 'slate' || v === 'neutral') return v
  return 'light'
}

function narrowDashboardType(v: string): DashboardType {
  if (v === 'custom' || v === 'middleware' || v === 'saas') return v
  return 'middleware'
}

function safeJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text)
    return parsed as T
  } catch {
    return fallback
  }
}
