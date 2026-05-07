import type { ClientConfig } from '@/lib/client-config'
import { BrandFavicon } from './BrandFavicon'

/**
 * Emits a <style> tag and (optionally) a Google Fonts <link> based on the
 * client's branding. Server component — runs once per request, output ends up
 * in the HTML so the brand color is applied before any JS hydrates.
 *
 * The CSS variables here override the build-time defaults from app/globals.css.
 * Sidebar uses --sidebar-* tokens which are scoped to the sidebar element by
 * Sidebar.tsx; this layer handles the global --primary tokens.
 */
export function BrandStyle({ clientConfig }: { clientConfig: ClientConfig }) {
  const css = buildBrandCss(clientConfig)
  const fontHref = buildGoogleFontHref(clientConfig.brandFontFamily)

  return (
    <>
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      <BrandFavicon href={clientConfig.brandFaviconUrl} />
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </>
  )
}

function buildBrandCss(c: ClientConfig): string {
  const lines: string[] = []
  lines.push(':root {')
  if (isHexColor(c.brandPrimaryColor)) {
    lines.push(`  --primary: ${c.brandPrimaryColor};`)
    lines.push(`  --ring: ${c.brandPrimaryColor};`)
  }
  if (c.brandFontFamily) {
    const safe = c.brandFontFamily.replace(/['"\\]/g, '')
    lines.push(`  --font-sans: '${safe}', system-ui, sans-serif;`)
  }
  lines.push('}')
  if (c.brandFontFamily) {
    const safe = c.brandFontFamily.replace(/['"\\]/g, '')
    lines.push(`body { font-family: '${safe}', system-ui, sans-serif; }`)
  }
  return lines.join('\n')
}

function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v)
}

function buildGoogleFontHref(family: string | null): string | null {
  if (!family) return null
  // Only inject for plausible Google Font names — letters, spaces, hyphens.
  // If staff pasted a raw CSS stack like "Helvetica, sans-serif" we skip the link
  // and just use the family in the CSS variable.
  if (!/^[A-Za-z][A-Za-z\s-]{0,49}$/.test(family.trim())) return null
  const param = encodeURIComponent(family.trim()).replace(/%20/g, '+')
  return `https://fonts.googleapis.com/css2?family=${param}:wght@400;500;600;700&display=swap`
}
