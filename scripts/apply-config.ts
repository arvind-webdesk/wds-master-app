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

// ─── Types (mirror the v1 contract) ──────────────────────────────────────────

interface ClientInfo {
  name:              string
  slug:              string
  adminEmail:        string
  adminFirstName:    string
  adminLastName:     string
  brandPrimaryColor: string
  brandLogoUrl?:     string | null
  notes?:            string | null
}

interface ModuleFlag {
  key:     string
  enabled: boolean
}

interface SeedDataV1 {
  version:        1
  client:         ClientInfo
  modules:        ModuleFlag[]
  provisionedAt?: string
  provisionedBy?: string
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function ok(msg:   string) { console.log(`  ✓  ${msg}`) }
function skip(msg: string) { console.log(`  –  ${msg}`) }
function warn(msg: string) { console.warn(`  !  ${msg}`) }
function fail(msg: string): never { console.error(`  ✗  ${msg}`); process.exit(1) }

// ─── Load + validate seed-data.json ──────────────────────────────────────────

function loadSeedData(): SeedDataV1 {
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

  if (!data.client || typeof data.client !== 'object') fail('Missing "client" object')
  const c = data.client as Partial<ClientInfo>

  const required = ['name', 'slug', 'adminEmail', 'adminFirstName', 'adminLastName', 'brandPrimaryColor'] as const
  for (const k of required) {
    if (typeof c[k] !== 'string' || !c[k]) {
      fail(`client.${k} must be a non-empty string`)
    }
  }

  // Validate brand color is hex
  if (!/^#[0-9a-fA-F]{6}$/.test(c.brandPrimaryColor!)) {
    warn(`brandPrimaryColor "${c.brandPrimaryColor}" is not a 6-digit hex; falling back to #2563EB`)
    c.brandPrimaryColor = '#2563EB'
  }

  if (!Array.isArray(data.modules)) fail('modules must be an array')
  for (const m of data.modules!) {
    if (typeof m.key !== 'string' || typeof m.enabled !== 'boolean') {
      fail(`Invalid module entry: ${JSON.stringify(m)}`)
    }
  }

  ok(`Loaded ${path.relative(REPO_ROOT, existing)} (${data.modules!.length} modules)`)
  return data as SeedDataV1
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

function writeClientConfig(data: SeedDataV1) {
  const c = data.client
  const enabledKeys = data.modules.filter((m) => m.enabled).map((m) => m.key)

  const quote = (s: string | null | undefined) =>
    s == null ? 'null' : JSON.stringify(s)

  const content =
`/**
 * Client configuration — AUTO-GENERATED by scripts/apply-config.ts on ${new Date().toISOString()}.
 * Source of truth: seed-data.json committed by the onboarding tool.
 * DO NOT hand-edit — run \`pnpm apply:config\` to regenerate.
 */

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
}

export const CLIENT_CONFIG: ClientConfig = {
  name:              ${quote(c.name)},
  slug:              ${quote(c.slug)},
  adminEmail:        ${quote(c.adminEmail)},
  adminFirstName:    ${quote(c.adminFirstName)},
  adminLastName:     ${quote(c.adminLastName)},
  brandPrimaryColor: ${quote(c.brandPrimaryColor)},
  brandLogoUrl:      ${quote(c.brandLogoUrl ?? null)},
  notes:             ${quote(c.notes ?? null)},
  provisionedAt:     ${quote(data.provisionedAt ?? null)},
  provisionedBy:     ${quote(data.provisionedBy ?? null)},
}

export const ENABLED_MODULES: ReadonlySet<string> = new Set([
${enabledKeys.map((k) => `  ${JSON.stringify(k)},`).join('\n')}
])

export function isModuleEnabled(key: string): boolean {
  return ENABLED_MODULES.has(key)
}
`

  fs.writeFileSync(CLIENT_CONFIG_PATH, content, 'utf8')
  ok(`Wrote ${path.relative(REPO_ROOT, CLIENT_CONFIG_PATH)}`)
}

// ─── Phase 2: Inject brand color into app/globals.css ───────────────────────

const BRAND_BEGIN = '/* ───── BEGIN onboarding-brand (auto-generated, do not edit) ───── */'
const BRAND_END   = '/* ───── END onboarding-brand ───── */'

function writeBrandBlock(data: SeedDataV1) {
  if (!fs.existsSync(GLOBALS_CSS_PATH)) {
    warn(`${path.relative(REPO_ROOT, GLOBALS_CSS_PATH)} not found — skipping brand injection`)
    return
  }

  const oklch = hexToOklch(data.client.brandPrimaryColor)
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

function writeClientNotes(data: SeedDataV1) {
  const notes = data.client.notes?.trim()
  if (!notes) { skip('No notes — client-notes.md not written'); return }

  fs.mkdirSync(path.dirname(CLIENT_NOTES_PATH), { recursive: true })
  const body =
`# Client notes — ${data.client.name}

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

function runSeed(data: SeedDataV1) {
  if (NO_SEED) { skip('Skipping pnpm db:seed (--no-seed)'); return }
  console.log('\n→ Running pnpm db:seed...')
  const env = {
    ...process.env,
    SEED_EMAIL:    data.client.adminEmail,
    SEED_FNAME:    data.client.adminFirstName,
    SEED_LNAME:    data.client.adminLastName,
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

  const enabled = data.modules.filter((m) => m.enabled).map((m) => m.key)
  const temp = process.env.SEED_PASSWORD ?? 'Admin@1234'

  console.log(`
┌──────────────────────────────────────────────────────┐
│  Onboarding applied — ${data.client.name.padEnd(30)} │
├──────────────────────────────────────────────────────┤
│  Admin sign-in                                       │
│    Email    ${data.client.adminEmail.padEnd(40)} │
│    Password ${temp.padEnd(40)} │
│                                                      │
│  Modules enabled (${String(enabled.length).padEnd(2)})                                │
│    ${enabled.join(' · ').padEnd(48)} │
└──────────────────────────────────────────────────────┘
`)
}

main()
