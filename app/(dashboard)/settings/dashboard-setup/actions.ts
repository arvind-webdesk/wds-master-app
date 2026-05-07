'use server'

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clientConfig as clientConfigTable } from '@/lib/db/schema/client-config'
import { connections } from '@/lib/db/schema/connections'
import { moduleEnablement } from '@/lib/db/schema/module-enablement'
import { integrationConfig } from '@/lib/db/schema/integration-config'
import { projectPlanning } from '@/lib/db/schema/project-planning'
import { getSessionUser } from '@/lib/auth/session'
import { encryptJson } from '@/lib/crypto/encryption'
import { ONBOARDING_MODULES, REQUIRED_MODULE_KEYS } from '@/lib/onboarding/modules'
import { setupSchema, type SetupFormValues } from './schema'

export interface SaveSetupResult {
  ok:           boolean
  fieldErrors?: Record<string, string>
  friendlyError?: string
}

export interface BrandInferenceResult {
  ok: boolean
  error?: string
  data?: {
    primaryColor?:   string
    secondaryColor?: string
    fontFamily?:     string
    logoUrl?:        string
    faviconUrl?:     string
  }
}

const MAX_HTML_BYTES = 500_000
const MAX_CSS_BYTES  = 300_000
const MAX_ASSET_BYTES = 2_000_000
const FETCH_TIMEOUT_MS = 8_000

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

/**
 * Persist the setup wizard input.
 *
 * Upserts client_config (single row), replaces module_enablement (one row per
 * known module), replaces the two integration_config rows, and upserts the
 * project_planning row. Scope documents are uploaded out-of-band via
 * upload-action.ts; this action only validates that the referenced ids exist.
 *
 * The first successful save stamps `completedAt` so the first-run banner
 * disappears.
 */
export async function saveSetup(input: SetupFormValues): Promise<SaveSetupResult> {
  const user = await getSessionUser()
  if (!user) {
    return { ok: false, friendlyError: 'Your session has expired. Please sign in again.' }
  }

  if (user.userType !== 'superadmin') {
    return { ok: false, friendlyError: 'Dashboard Setup is restricted to super admins.' }
  }

  const parsed = setupSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.')
      if (!fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, fieldErrors }
  }

  const v   = parsed.data
  const now = new Date().toISOString()

  const [existing] = await db.select().from(clientConfigTable).where(eq(clientConfigTable.id, 1)).limit(1)

  // ── 1. Upsert client_config ──────────────────────────────────────────────
  const baseRow = {
    name:                v.name,
    slug:                v.slug,
    industry:            v.industry ?? null,
    country:             v.country ?? null,
    timezone:            v.timezone,
    brandPrimaryColor:   v.brandPrimaryColor,
    brandSecondaryColor: v.brandSecondaryColor ?? null,
    brandFontFamily:     v.brandFontFamily ?? null,
    brandLogoUrl:        v.brandLogoUrl ?? null,
    brandFaviconUrl:     v.brandFaviconUrl ?? null,
    sidebarTheme:        v.sidebarTheme,
    dashboardType:       v.dashboardType,
    notes:               v.notes ?? null,
    completedAt:         existing?.completedAt ?? now,
    completedBy:         existing?.completedBy ?? user.id,
    updatedAt:           now,
  }

  if (existing) {
    await db.update(clientConfigTable).set(baseRow).where(eq(clientConfigTable.id, 1))
  } else {
    await db.insert(clientConfigTable).values({ id: 1, ...baseRow, createdAt: now })
  }

  // ── 2. Replace module_enablement rows ────────────────────────────────────
  const enabledSet = new Set([...REQUIRED_MODULE_KEYS, ...v.enabledModules])
  for (const mod of ONBOARDING_MODULES) {
    const enabled = enabledSet.has(mod.key)
    const existingRow = await db.select().from(moduleEnablement).where(eq(moduleEnablement.moduleKey, mod.key)).limit(1)
    if (existingRow.length > 0) {
      await db.update(moduleEnablement).set({ enabled, updatedAt: now }).where(eq(moduleEnablement.moduleKey, mod.key))
    } else {
      await db.insert(moduleEnablement).values({ moduleKey: mod.key, enabled, updatedAt: now })
    }
  }

  // ── 3. Replace integration_config rows ───────────────────────────────────
  const supportsIntegrations = v.dashboardType === 'middleware' || v.dashboardType === 'custom'
  for (const platform of ['shopify', 'bigcommerce'] as const) {
    const cfg     = v.integrations[platform]
    const enabled = supportsIntegrations && cfg.enabled
    const row = {
      enabled,
      storeUrl:      platform === 'shopify' ? (cfg as typeof v.integrations.shopify).storeUrl ?? null : null,
      storeHash:     platform === 'bigcommerce' ? (cfg as typeof v.integrations.bigcommerce).storeHash ?? null : null,
      syncProducts:  cfg.sync.products,
      syncOrders:    cfg.sync.orders,
      syncCustomers: cfg.sync.customers,
      updatedAt:     now,
    }
    const existingRow = await db.select().from(integrationConfig).where(eq(integrationConfig.platform, platform)).limit(1)
    if (existingRow.length > 0) {
      await db.update(integrationConfig).set(row).where(eq(integrationConfig.platform, platform))
    } else {
      await db.insert(integrationConfig).values({ platform, ...row })
    }
  }

  const bc = v.integrations.bigcommerce
  if (supportsIntegrations && bc.enabled && bc.storeHash && bc.connection.accessToken && bc.connection.clientId) {
    const storeHash = bc.storeHash.toLowerCase()
    const encryptedCredentials = encryptJson({
      storeHash,
      accessToken:  bc.connection.accessToken,
      clientId:     bc.connection.clientId,
      clientSecret: bc.connection.clientSecret || undefined,
    })
    const [existingConnection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.type, 'bigcommerce'),
          eq(connections.storeIdentifier, storeHash),
          isNull(connections.deletedAt),
        ),
      )
      .limit(1)

    const connectionRow = {
      name:        bc.connection.name || `${v.name} BigCommerce`,
      status:      'active',
      credentials: encryptedCredentials,
      updatedAt:   now,
    }

    if (existingConnection) {
      await db.update(connections).set(connectionRow).where(eq(connections.id, existingConnection.id))
    } else {
      await db.insert(connections).values({
        ...connectionRow,
        type:            'bigcommerce',
        storeIdentifier: storeHash,
        createdBy:       user.id,
      })
    }
  }

  // ── 4. Upsert project_planning ───────────────────────────────────────────
  const planningRow = {
    notes:     v.planningNotes ?? null,
    updatedAt: now,
  }
  const [existingPlanning] = await db.select().from(projectPlanning).where(eq(projectPlanning.id, 1)).limit(1)
  if (existingPlanning) {
    await db.update(projectPlanning).set(planningRow).where(eq(projectPlanning.id, 1))
  } else {
    await db.insert(projectPlanning).values({ id: 1, ...planningRow })
  }

  // Scope documents are uploaded incrementally via upload-action.ts and are
  // already persisted; nothing else to do here.

  // Invalidate every dashboard route — sidebar visibility depends on this config.
  revalidatePath('/', 'layout')

  return { ok: true }
}

export async function inferBrandingFromWebsite(rawUrl: string): Promise<BrandInferenceResult> {
  const user = await getSessionUser()
  if (!user) {
    return { ok: false, error: 'Your session has expired. Please sign in again.' }
  }
  if (user.userType !== 'superadmin') {
    return { ok: false, error: 'Dashboard Setup is restricted to super admins.' }
  }

  let url: URL
  try {
    url = normalizeWebsiteUrl(rawUrl)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Enter a valid website URL.' }
  }

  try {
    const html = await fetchText(url, MAX_HTML_BYTES)
    const cssUrls = extractCssUrls(html, url).slice(0, 3)
    const cssTexts = await Promise.all(
      cssUrls.map(async (cssUrl) => {
        try {
          return await fetchText(cssUrl, MAX_CSS_BYTES)
        } catch {
          return ''
        }
      }),
    )

    const combinedCss = [extractInlineStyles(html), ...cssTexts].filter(Boolean).join('\n')
    const colors = inferColors(html, combinedCss)
    const fontFamily = inferFontFamily(html, combinedCss)
    const remoteLogoUrl = inferLogoUrl(html, url)
    const remoteFaviconUrl = inferFaviconUrl(html, url)
    const [logoUrl, faviconUrl] = await Promise.all([
      remoteLogoUrl ? downloadBrandAsset(remoteLogoUrl, 'logo') : Promise.resolve(undefined),
      remoteFaviconUrl ? downloadBrandAsset(remoteFaviconUrl, 'favicon') : Promise.resolve(undefined),
    ])

    const data = {
      primaryColor: colors.primaryColor,
      secondaryColor: colors.secondaryColor,
      fontFamily,
      logoUrl,
      faviconUrl,
    }
    const hasData = Object.values(data).some(Boolean)

    if (!hasData) {
      return { ok: false, error: 'No brand colors, font, logo, or favicon were found on that page.' }
    }

    return { ok: true, data }
  } catch (err) {
    console.error('[inferBrandingFromWebsite]', err)
    return { ok: false, error: 'Could not read that website. Check the URL and try again.' }
  }
}

function normalizeWebsiteUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim()
  if (!trimmed) throw new Error('Enter a website URL.')
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Enter an http or https website URL.')
  }
  const hostname = url.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(hostname) || isPrivateIp(hostname)) {
    throw new Error('Enter a public website URL.')
  }
  return url
}

async function fetchText(url: URL, maxBytes: number): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html, text/css;q=0.9, */*;q=0.1',
        'user-agent': 'WDSDashboardBrandImporter/1.0',
      },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`Fetch failed with ${res.status}`)
    const text = await res.text()
    return text.slice(0, maxBytes)
  } finally {
    clearTimeout(timeout)
  }
}

function extractCssUrls(html: string, baseUrl: URL): URL[] {
  const urls: URL[] = []
  const linkRe = /<link\b[^>]*>/gi
  for (const tag of html.match(linkRe) ?? []) {
    const rel = attr(tag, 'rel')?.toLowerCase() ?? ''
    const href = attr(tag, 'href')
    if (!href || !rel.includes('stylesheet')) continue
    try {
      const cssUrl = new URL(decodeHtml(href), baseUrl)
      if (cssUrl.protocol === 'https:' || cssUrl.protocol === 'http:') urls.push(cssUrl)
    } catch {
      // Ignore malformed stylesheet URLs.
    }
  }
  return urls
}

function extractInlineStyles(html: string): string {
  const styles: string[] = []
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
  let match: RegExpExecArray | null
  while ((match = styleRe.exec(html)) !== null) {
    styles.push(match[1] ?? '')
  }
  return styles.join('\n')
}

function inferColors(html: string, css: string): { primaryColor?: string; secondaryColor?: string } {
  const candidates: Array<{ color: string; score: number }> = []

  const themeColor = metaContent(html, 'theme-color')
  if (themeColor) {
    const color = normalizeHexColor(themeColor)
    if (color) candidates.push({ color, score: 120 })
  }

  const cssVarRe = /--([a-z0-9-]*(?:brand|primary|accent|secondary)[a-z0-9-]*)\s*:\s*([^;}{]+)/gi
  let varMatch: RegExpExecArray | null
  while ((varMatch = cssVarRe.exec(css)) !== null) {
    const name = (varMatch[1] ?? '').toLowerCase()
    const color = normalizeHexColor(varMatch[2] ?? '')
    if (!color || isNeutralColor(color)) continue
    const score = name.includes('primary') || name.includes('brand') ? 90 : 70
    candidates.push({ color, score })
  }

  const allColorRe = /#[0-9a-f]{3,8}\b/gi
  const counts = new Map<string, number>()
  for (const raw of `${html}\n${css}`.match(allColorRe) ?? []) {
    const color = normalizeHexColor(raw)
    if (!color || isNeutralColor(color)) continue
    counts.set(color, (counts.get(color) ?? 0) + 1)
  }
  for (const [color, count] of counts) {
    candidates.push({ color, score: Math.min(60, count * 6) })
  }

  const ranked = Array.from(
    candidates.reduce((map, c) => map.set(c.color, (map.get(c.color) ?? 0) + c.score), new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color)

  const primaryColor = ranked[0]
  const secondaryColor = ranked.find((color) => color !== primaryColor && colorDistance(color, primaryColor) > 70)
  return { primaryColor, secondaryColor }
}

function inferFontFamily(html: string, css: string): string | undefined {
  const googleFont = extractGoogleFontFamily(html)
  if (googleFont) return googleFont

  const fontRules = [
    /body\s*{[^}]*font-family\s*:\s*([^;}]+)/i,
    /html\s*{[^}]*font-family\s*:\s*([^;}]+)/i,
    /:root\s*{[^}]*font-family\s*:\s*([^;}]+)/i,
    /font-family\s*:\s*([^;}]+)/i,
  ]

  for (const re of fontRules) {
    const match = css.match(re)
    const family = match?.[1] ? cleanFontFamily(match[1]) : undefined
    if (family) return family
  }
  return undefined
}

function extractGoogleFontFamily(html: string): string | undefined {
  const hrefs = Array.from(html.matchAll(/<link\b[^>]*href=["']([^"']*fonts\.googleapis\.com\/css[^"']*)["'][^>]*>/gi))
    .map((m) => decodeHtml(m[1] ?? ''))
  for (const href of hrefs) {
    try {
      const fontUrl = new URL(href)
      const family = fontUrl.searchParams.get('family')?.split(':')[0]?.replace(/\+/g, ' ').trim()
      if (family) return family
    } catch {
      // Ignore malformed font URLs.
    }
  }
  return undefined
}

function cleanFontFamily(raw: string): string | undefined {
  const systemFonts = new Set([
    'sans-serif', 'serif', 'monospace', 'system-ui', '-apple-system',
    'blinkmacsystemfont', 'segoe ui', 'arial', 'helvetica', 'inherit',
  ])
  const first = raw
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .find((part) => part && !part.startsWith('var(') && !systemFonts.has(part.toLowerCase()))
  return first?.slice(0, 100)
}

function inferLogoUrl(html: string, baseUrl: URL): string | undefined {
  const imgRe = /<img\b[^>]*>/gi
  for (const tag of html.match(imgRe) ?? []) {
    const src = attr(tag, 'src')
    if (!src) continue
    const haystack = `${attr(tag, 'alt') ?? ''} ${attr(tag, 'class') ?? ''} ${attr(tag, 'id') ?? ''} ${src}`.toLowerCase()
    if (!haystack.includes('logo')) continue
    return resolvePublicUrl(src, baseUrl)
  }
  const ogImage = metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image')
  return ogImage ? resolvePublicUrl(ogImage, baseUrl) : undefined
}

function inferFaviconUrl(html: string, baseUrl: URL): string | undefined {
  const linkRe = /<link\b[^>]*>/gi
  const iconTags = (html.match(linkRe) ?? [])
    .filter((tag) => (attr(tag, 'rel') ?? '').toLowerCase().includes('icon'))
  for (const tag of iconTags) {
    const href = attr(tag, 'href')
    if (href) return resolvePublicUrl(href, baseUrl)
  }
  return resolvePublicUrl('/favicon.ico', baseUrl)
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const match = tag.match(re)
  return decodeHtml(match?.[2] ?? match?.[3] ?? match?.[4] ?? '')
}

function metaContent(html: string, name: string): string | undefined {
  const metaRe = /<meta\b[^>]*>/gi
  const lowerName = name.toLowerCase()
  for (const tag of html.match(metaRe) ?? []) {
    const key = (attr(tag, 'name') ?? attr(tag, 'property') ?? '').toLowerCase()
    if (key === lowerName) return attr(tag, 'content')
  }
  return undefined
}

function resolvePublicUrl(raw: string, baseUrl: URL): string | undefined {
  try {
    const url = new URL(decodeHtml(raw), baseUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

async function downloadBrandAsset(rawUrl: string, kind: 'logo' | 'favicon'): Promise<string | undefined> {
  let url: URL
  try {
    url = normalizeWebsiteUrl(rawUrl)
  } catch {
    return undefined
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'image/avif,image/webp,image/svg+xml,image/png,image/jpeg,image/x-icon,image/vnd.microsoft.icon,*/*;q=0.1',
        'user-agent': 'WDSDashboardBrandImporter/1.0',
      },
      redirect: 'follow',
    })
    if (!res.ok) return undefined
    if (res.url) {
      try {
        normalizeWebsiteUrl(res.url)
      } catch {
        return undefined
      }
    }

    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    const ext = extensionForAsset(contentType, new URL(res.url || url.toString()).pathname)
    if (!ext) return undefined

    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES) return undefined

    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16)
    const dir = path.join(process.cwd(), 'public', 'brand-assets')
    const filename = `${kind}-${hash}${ext}`
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, filename), bytes)
    return `/brand-assets/${filename}`
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

function extensionForAsset(contentType: string, pathname: string): string | undefined {
  const fromType: Record<string, string> = {
    'image/avif': '.avif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
  }
  if (fromType[contentType]) return fromType[contentType]

  const ext = path.extname(pathname).toLowerCase()
  if (['.avif', '.webp', '.svg', '.png', '.jpg', '.jpeg', '.ico'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext
  }
  return undefined
}

function normalizeHexColor(raw: string): string | undefined {
  const match = raw.trim().match(/#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i)
  if (!match) return undefined
  const hex = match[1]!
  if (hex.length === 3) {
    return `#${hex.split('').map((ch) => ch + ch).join('')}`.toUpperCase()
  }
  return `#${hex.slice(0, 6)}`.toUpperCase()
}

function isNeutralColor(hex: string): boolean {
  const [r, g, b] = rgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min < 18 || max < 35 || min > 235
}

function colorDistance(a: string, b?: string): number {
  if (!b) return Number.POSITIVE_INFINITY
  const ar = rgb(a)
  const br = rgb(b)
  return Math.sqrt((ar[0] - br[0]) ** 2 + (ar[1] - br[1]) ** 2 + (ar[2] - br[2]) ** 2)
}

function rgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function isPrivateIp(hostname: string): boolean {
  const parts = hostname.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false
  const [a, b] = parts
  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
