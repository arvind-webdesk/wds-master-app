/**
 * apply-config — adapt this cloned dashboard to a specific client.
 *
 * Reads seed-data.json at repo root and:
 *   1. Regenerates lib/client-config.ts from the JSON
 *   2. Appends / replaces a brand-color block in app/globals.css
 *   3. (optional) runs `pnpm drizzle-kit migrate`
 *   4. (optional) runs `pnpm db:seed` with admin-email overrides
 *
 * Usage:
 *   pnpm apply:config                     — full pipeline (apply + migrate + seed)
 *   pnpm apply:config -- --files-only     — skip migrations + seed (pre-push pipeline)
 *   pnpm apply:config -- --no-seed        — apply + migrate but don't seed
 *
 * Exit codes:
 *   0 = success
 *   1 = validation or runtime error
 */

import fs           from 'node:fs'
import path         from 'node:path'
import { spawnSync } from 'node:child_process'

// ─── Args ────────────────────────────────────────────────────────────────────

const ARGS       = process.argv.slice(2)
const FILES_ONLY = ARGS.includes('--files-only')
const NO_SEED    = ARGS.includes('--no-seed') || FILES_ONLY
const NO_MIGRATE = ARGS.includes('--no-migrate') || FILES_ONLY

// ─── Paths ───────────────────────────────────────────────────────────────────

const REPO_ROOT       = process.cwd()
const SEED_DATA_PATHS = [
  path.join(REPO_ROOT, 'seed-data.json'),
  path.join(REPO_ROOT, 'prisma/seed-data.json'),
  path.join(REPO_ROOT, '.onboarding/seed-data.json'),
]
const CLIENT_CONFIG_PATH = path.join(REPO_ROOT, 'lib/client-config.ts')
const GLOBALS_CSS_PATH   = path.join(REPO_ROOT, 'app/globals.css')
const CLIENT_NOTES_PATH  = path.join(REPO_ROOT, 'docs/client-notes.md')

// ─── Types (mirror the v1 contract written by the onboarding tool) ──────────
// The onboarding tool's SeedData is nested: client / contact / branding / plan.
// Downstream code in this script works off a flat normalized struct (below).

interface SeedDataV1 {
  version: 1
  client: {
    name:      string
    slug:      string
    industry?: string | null
    country?:  string | null
    timezone?: string
  }
  contact: {
    adminName:   string
    adminEmail:  string
    adminPhone?: string | null
  }
  branding: {
    primaryColor:    string
    secondaryColor?: string | null
    logoUrl?:        string | null
    faviconUrl?:     string | null
    /** Sidebar palette preset. Defaults to 'light' when absent. */
    sidebarTheme?:   'light' | 'navy' | 'zoho' | 'slate' | 'neutral'
  }
  plan?: {
    tier?:       string
    userSeats?:  number
    goLiveDate?: string | null
  }
  modules: Array<{ key: string; enabled: boolean }>
  /**
   * Added in the "dashboard type" flow — OPTIONAL for backward compat with
   * older seed-data.json files. Defaults to 'custom' when absent.
   */
  dashboardType?: 'custom' | 'middleware' | 'saas'
  integrations?: {
    shopify?: {
      enabled?:  boolean
      storeUrl?: string | null
      sync?: { products?: boolean; orders?: boolean; customers?: boolean }
    }
    bigcommerce?: {
      enabled?:   boolean
      storeHash?: string | null
      sync?: { products?: boolean; orders?: boolean; customers?: boolean }
    }
  }
  notes?:          string | null
  provisionedAt?:  string
  provisionedBy?:  string
}

/** Flat shape used by every downstream function in this file. */
interface NormalizedSeed {
  name:              string
  slug:              string
  adminEmail:        string
  adminFirstName:    string
  adminLastName:     string
  brandPrimaryColor: string
  brandLogoUrl:      string | null
  notes:             string | null
  enabledModules:    string[]
  provisionedAt:     string | null
  provisionedBy:     string | null
  dashboardType:     'custom' | 'middleware' | 'saas'
  sidebarTheme:      'light' | 'navy' | 'zoho' | 'slate' | 'neutral'
  integrations: {
    shopify: {
      enabled:  boolean
      storeUrl: string
      sync:     { products: boolean; orders: boolean; customers: boolean }
    }
    bigcommerce: {
      enabled:   boolean
      storeHash: string
      sync:      { products: boolean; orders: boolean; customers: boolean }
    }
  }
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function ok(msg:   string) { console.log(`  ✓  ${msg}`) }
function skip(msg: string) { console.log(`  –  ${msg}`) }
function warn(msg: string) { console.warn(`  !  ${msg}`) }
function fail(msg: string): never { console.error(`  ✗  ${msg}`); process.exit(1) }

// ─── Load + validate seed-data.json ──────────────────────────────────────────

function loadSeedData(): NormalizedSeed {
  const existing = SEED_DATA_PATHS.find((p) => fs.existsSync(p))
  if (!existing) {
    fail(
      'No seed-data.json found at any of:\n' +
      SEED_DATA_PATHS.map((p) => `    ${path.relative(REPO_ROOT, p)}`).join('\n') +
      '\nThe onboarding tool should commit this file during provisioning.',
    )
  }

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(existing, 'utf8'))
  } catch (err: any) {
    fail(`Failed to parse ${path.relative(REPO_ROOT, existing)}: ${err.message}`)
  }

  if (!raw || typeof raw !== 'object') fail('seed-data.json must be an object')
  const data = raw as Partial<SeedDataV1>

  if (data.version !== 1) {
    fail(`Unsupported seed-data version: ${data.version}. This apply-config expects version 1.`)
  }

  if (!data.client   || typeof data.client   !== 'object') fail('Missing "client" object')
  if (!data.contact  || typeof data.contact  !== 'object') fail('Missing "contact" object')
  if (!data.branding || typeof data.branding !== 'object') fail('Missing "branding" object')

  const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

  if (!nonEmpty(data.client.name))        fail('client.name must be a non-empty string')
  if (!nonEmpty(data.client.slug))        fail('client.slug must be a non-empty string')
  if (!nonEmpty(data.contact.adminName))  fail('contact.adminName must be a non-empty string')
  if (!nonEmpty(data.contact.adminEmail)) fail('contact.adminEmail must be a non-empty string')
  if (!nonEmpty(data.branding.primaryColor)) fail('branding.primaryColor must be a non-empty string')

  // Split adminName into first/last on the first whitespace.
  // "Jane Doe"             → first="Jane", last="Doe"
  // "Jane Middle Doe"      → first="Jane", last="Middle Doe"
  // "Cher"                 → first="Cher", last=""
  const parts = data.contact.adminName.trim().split(/\s+/)
  const adminFirstName = parts[0] ?? ''
  const adminLastName  = parts.length > 1 ? parts.slice(1).join(' ') : ''

  // Validate + sanitize brand color.
  let brandPrimaryColor = data.branding.primaryColor.trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(brandPrimaryColor)) {
    warn(`branding.primaryColor "${brandPrimaryColor}" is not a 6-digit hex; falling back to #2563EB`)
    brandPrimaryColor = '#2563EB'
  }

  if (!Array.isArray(data.modules)) fail('modules must be an array')
  for (const m of data.modules) {
    if (typeof m.key !== 'string' || typeof m.enabled !== 'boolean') {
      fail(`Invalid module entry: ${JSON.stringify(m)}`)
    }
  }

  const enabledModules = data.modules.filter((m) => m.enabled).map((m) => m.key)

  // ── Dashboard type + integrations (all optional for backward compat) ──────
  const rawType = data.dashboardType ?? 'custom'
  if (rawType !== 'custom' && rawType !== 'middleware' && rawType !== 'saas') {
    fail(`Unknown dashboardType "${rawType}" — expected custom | middleware | saas`)
  }
  if (rawType === 'saas') {
    warn('dashboardType=saas is not yet supported by this template; falling back to custom')
  }
  const dashboardType: NormalizedSeed['dashboardType'] =
    rawType === 'saas' ? 'custom' : rawType

  // Sidebar theme — optional, validated against known preset keys.
  const SIDEBAR_THEME_KEYS = ['light', 'navy', 'zoho', 'slate', 'neutral'] as const
  const rawTheme = data.branding.sidebarTheme ?? 'light'
  const sidebarTheme: NormalizedSeed['sidebarTheme'] =
    (SIDEBAR_THEME_KEYS as readonly string[]).includes(rawTheme)
      ? (rawTheme as NormalizedSeed['sidebarTheme'])
      : 'light'
  if (rawTheme !== sidebarTheme) {
    warn(`Unknown branding.sidebarTheme "${rawTheme}" — falling back to "light"`)
  }

  const shopifyRaw     = data.integrations?.shopify     ?? {}
  const bigcommerceRaw = data.integrations?.bigcommerce ?? {}

  const integrations: NormalizedSeed['integrations'] = {
    shopify: {
      enabled:  dashboardType === 'middleware' && !!shopifyRaw.enabled,
      storeUrl: (shopifyRaw.storeUrl ?? '').trim(),
      sync: {
        products:  !!shopifyRaw.sync?.products,
        orders:    !!shopifyRaw.sync?.orders,
        customers: !!shopifyRaw.sync?.customers,
      },
    },
    bigcommerce: {
      enabled:   dashboardType === 'middleware' && !!bigcommerceRaw.enabled,
      storeHash: (bigcommerceRaw.storeHash ?? '').trim(),
      sync: {
        products:  !!bigcommerceRaw.sync?.products,
        orders:    !!bigcommerceRaw.sync?.orders,
        customers: !!bigcommerceRaw.sync?.customers,
      },
    },
  }

  ok(`Loaded ${path.relative(REPO_ROOT, existing)} (${data.modules.length} modules, ${enabledModules.length} enabled, type=${dashboardType})`)

  return {
    name:              data.client.name,
    slug:              data.client.slug,
    adminEmail:        data.contact.adminEmail,
    adminFirstName,
    adminLastName,
    brandPrimaryColor,
    brandLogoUrl:      data.branding.logoUrl ?? null,
    notes:             data.notes ?? null,
    enabledModules,
    provisionedAt:     data.provisionedAt ?? null,
    provisionedBy:     data.provisionedBy ?? null,
    dashboardType,
    sidebarTheme,
    integrations,
  }
}

// ─── Hex → oklch conversion (Björn Ottosson, 2020) ───────────────────────────

function hexToOklch(hex: string): string {
  const m = hex.match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return 'oklch(0.519 0.238 264.052)' // blue-600 fallback

  const r = parseInt(m[1].slice(0, 2), 16) / 255
  const g = parseInt(m[1].slice(2, 4), 16) / 255
  const b = parseInt(m[1].slice(4, 6), 16) / 255

  const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const lr = toLin(r), lg = toLin(g), lb = toLin(b)

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const mm = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const l_ = Math.cbrt(l), m_ = Math.cbrt(mm), s_ = Math.cbrt(s)

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_

  const C = Math.sqrt(a * a + bb * bb)
  let H = (Math.atan2(bb, a) * 180) / Math.PI
  if (H < 0) H += 360

  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(3)})`
}

// ─── Phase 1: Regenerate lib/client-config.ts ───────────────────────────────

function writeClientConfig(data: NormalizedSeed) {
  const quote = (s: string | null | undefined) =>
    s == null ? 'null' : JSON.stringify(s)

  const i = data.integrations
  const content =
`/**
 * Client configuration — AUTO-GENERATED by scripts/apply-config.ts on ${new Date().toISOString()}.
 * Source of truth: seed-data.json committed by the onboarding tool.
 * DO NOT hand-edit — run \`pnpm apply:config\` to regenerate.
 */

export type DashboardType = 'custom' | 'middleware' | 'saas'

export type SidebarTheme = 'light' | 'navy' | 'zoho' | 'slate' | 'neutral'

export interface SyncTargets {
  products:  boolean
  orders:    boolean
  customers: boolean
}

export interface IntegrationsConfig {
  shopify: {
    enabled:  boolean
    storeUrl: string
    sync:     SyncTargets
  }
  bigcommerce: {
    enabled:   boolean
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
  brandPrimaryColor: string
  brandLogoUrl:      string | null
  notes:             string | null
  provisionedAt:     string | null
  provisionedBy:     string | null
  dashboardType:     DashboardType
  sidebarTheme:      SidebarTheme
  integrations:      IntegrationsConfig
}

export const CLIENT_CONFIG: ClientConfig = {
  name:              ${quote(data.name)},
  slug:              ${quote(data.slug)},
  adminEmail:        ${quote(data.adminEmail)},
  adminFirstName:    ${quote(data.adminFirstName)},
  adminLastName:     ${quote(data.adminLastName)},
  brandPrimaryColor: ${quote(data.brandPrimaryColor)},
  brandLogoUrl:      ${quote(data.brandLogoUrl)},
  notes:             ${quote(data.notes)},
  provisionedAt:     ${quote(data.provisionedAt)},
  provisionedBy:     ${quote(data.provisionedBy)},
  dashboardType:     ${quote(data.dashboardType)},
  sidebarTheme:      ${quote(data.sidebarTheme)},
  integrations: {
    shopify: {
      enabled:  ${i.shopify.enabled},
      storeUrl: ${quote(i.shopify.storeUrl)},
      sync: {
        products:  ${i.shopify.sync.products},
        orders:    ${i.shopify.sync.orders},
        customers: ${i.shopify.sync.customers},
      },
    },
    bigcommerce: {
      enabled:   ${i.bigcommerce.enabled},
      storeHash: ${quote(i.bigcommerce.storeHash)},
      sync: {
        products:  ${i.bigcommerce.sync.products},
        orders:    ${i.bigcommerce.sync.orders},
        customers: ${i.bigcommerce.sync.customers},
      },
    },
  },
}

export const ENABLED_MODULES: ReadonlySet<string> = new Set([
${data.enabledModules.map((k) => `  ${JSON.stringify(k)},`).join('\n')}
])

export function isModuleEnabled(key: string): boolean {
  return ENABLED_MODULES.has(key)
}

export function isIntegrationEnabled(platform: 'shopify' | 'bigcommerce'): boolean {
  return (
    CLIENT_CONFIG.dashboardType === 'middleware' &&
    CLIENT_CONFIG.integrations[platform].enabled
  )
}
`

  fs.writeFileSync(CLIENT_CONFIG_PATH, content, 'utf8')
  ok(`Wrote ${path.relative(REPO_ROOT, CLIENT_CONFIG_PATH)}`)
}

// ─── Phase 2: Inject brand color into app/globals.css ───────────────────────

const BRAND_BEGIN = '/* ───── BEGIN onboarding-brand (auto-generated, do not edit) ───── */'
const BRAND_END   = '/* ───── END onboarding-brand ───── */'

function writeBrandBlock(data: NormalizedSeed) {
  if (!fs.existsSync(GLOBALS_CSS_PATH)) {
    warn(`${path.relative(REPO_ROOT, GLOBALS_CSS_PATH)} not found — skipping brand injection`)
    return
  }

  const oklch = hexToOklch(data.brandPrimaryColor)
  // Parse "oklch(L C H)" so we can derive soft / strong tints for secondary.
  const m = /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/.exec(oklch)
  const L = m ? Number(m[1]) : 0.55
  const C = m ? Number(m[2]) : 0.2
  const H = m ? Number(m[3]) : 264
  const softBg   = `oklch(0.96 ${(C * 0.15).toFixed(3)} ${H.toFixed(3)})`      // light-mode secondary bg
  const softFg   = `oklch(${Math.max(L - 0.07, 0.2).toFixed(3)} ${C.toFixed(3)} ${H.toFixed(3)})` // darker brand text
  const darkBg   = `oklch(0.25 ${(C * 0.3).toFixed(3)} ${H.toFixed(3)})`       // dark-mode secondary bg
  const darkFg   = `oklch(0.85 ${(C * 0.5).toFixed(3)} ${H.toFixed(3)})`       // light brand text

  const block = `${BRAND_BEGIN}
:root {
  --primary:              ${oklch};
  --primary-foreground:   oklch(1 0 0);
  --secondary:            ${softBg};
  --secondary-foreground: ${softFg};
  --accent:               ${oklch};
  --accent-foreground:    oklch(1 0 0);
  --ring:                 ${oklch};
  --sidebar-primary:      ${oklch};
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-ring:         ${oklch};
}
.dark {
  --primary:              ${oklch};
  --primary-foreground:   oklch(1 0 0);
  --secondary:            ${darkBg};
  --secondary-foreground: ${darkFg};
  --accent:               ${oklch};
  --accent-foreground:    oklch(1 0 0);
  --ring:                 ${oklch};
  --sidebar-primary:      ${oklch};
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-ring:         ${oklch};
}
${BRAND_END}
`

  const css = fs.readFileSync(GLOBALS_CSS_PATH, 'utf8')
  const beginIdx = css.indexOf(BRAND_BEGIN)
  const endIdx   = css.indexOf(BRAND_END)

  let next: string
  if (beginIdx >= 0 && endIdx > beginIdx) {
    // Replace existing block in place
    next = css.slice(0, beginIdx) + block + css.slice(endIdx + BRAND_END.length)
    ok('Replaced existing brand block in app/globals.css')
  } else {
    // Append (ensure trailing newline)
    next = (css.endsWith('\n') ? css : css + '\n') + '\n' + block
    ok('Appended brand block to app/globals.css')
  }

  fs.writeFileSync(GLOBALS_CSS_PATH, next, 'utf8')
}

// ─── Phase 3: Optional client notes ──────────────────────────────────────────

function writeClientNotes(data: NormalizedSeed) {
  const notes = data.notes?.trim()
  if (!notes) { skip('No notes — client-notes.md not written'); return }

  fs.mkdirSync(path.dirname(CLIENT_NOTES_PATH), { recursive: true })
  const body =
`# Client notes — ${data.name}

> Imported from onboarding on ${data.provisionedAt ?? 'unknown'} by ${data.provisionedBy ?? 'unknown'}.

${notes}
`
  fs.writeFileSync(CLIENT_NOTES_PATH, body, 'utf8')
  ok(`Wrote ${path.relative(REPO_ROOT, CLIENT_NOTES_PATH)}`)
}

// ─── Phase 4: drizzle-kit migrate ───────────────────────────────────────────

function runMigrate() {
  if (NO_MIGRATE) { skip('Skipping drizzle-kit migrate (--no-migrate)'); return }
  console.log('\n→ Running pnpm drizzle-kit migrate...')
  const res = spawnSync('pnpm', ['drizzle-kit', 'migrate'], { stdio: 'inherit', shell: process.platform === 'win32' })
  if (res.status !== 0) fail(`drizzle-kit migrate exited with code ${res.status}`)
  ok('Migrations applied')
}

// ─── Phase 5: pnpm db:seed with env overrides ───────────────────────────────

function runSeed(data: NormalizedSeed) {
  if (NO_SEED) { skip('Skipping pnpm db:seed (--no-seed)'); return }
  console.log('\n→ Running pnpm db:seed...')
  const env = {
    ...process.env,
    SEED_EMAIL:    data.adminEmail,
    SEED_FNAME:    data.adminFirstName,
    SEED_LNAME:    data.adminLastName,
    SEED_PASSWORD: process.env.SEED_PASSWORD ?? 'Admin@1234',
  }
  const res = spawnSync('pnpm', ['db:seed'], { stdio: 'inherit', shell: process.platform === 'win32', env })
  if (res.status !== 0) fail(`pnpm db:seed exited with code ${res.status}`)
  ok('Seed applied')
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('\nApplying onboarding config…\n')

  const data = loadSeedData()

  writeClientConfig(data)
  writeBrandBlock(data)
  writeClientNotes(data)

  runMigrate()
  runSeed(data)

  const temp = process.env.SEED_PASSWORD ?? 'Admin@1234'

  console.log(`
┌──────────────────────────────────────────────────────┐
│  Onboarding applied — ${data.name.padEnd(30)} │
├──────────────────────────────────────────────────────┤
│  Admin sign-in                                       │
│    Email    ${data.adminEmail.padEnd(40)} │
│    Password ${temp.padEnd(40)} │
│                                                      │
│  Modules enabled (${String(data.enabledModules.length).padEnd(2)})                                │
│    ${data.enabledModules.join(' · ').padEnd(48)} │
└──────────────────────────────────────────────────────┘
`)
}

main()
