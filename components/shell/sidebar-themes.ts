/**
 * Sidebar theme presets — scoped dark palettes applied only to the sidebar.
 *
 * The selected key is baked into CLIENT_CONFIG.sidebarTheme by apply-config
 * during provisioning. Sidebar.tsx reads the key at render time and spreads
 * the matching token set as inline CSS variables on the <aside>.
 *
 * Add new presets here — keys must match the Zod enum in both the onboarding
 * tool (actions.ts + OnboardForm.tsx) and apply-config.ts.
 */

export type SidebarThemeKey = 'light' | 'navy' | 'zoho' | 'slate' | 'neutral'

export interface SidebarThemeTokens {
  /** Sidebar background. */
  sidebar:                  string
  /** Sidebar foreground (primary text). */
  sidebarForeground:        string
  /** Divider between sidebar sections + aside's right border. */
  sidebarBorder:            string
  /** Hover / active row background. */
  sidebarAccent:            string
  /** Text color on hover / active rows. */
  sidebarAccentForeground:  string
  /** Soft secondary text (subtitles, meta). */
  mutedForeground:          string
}

export const SIDEBAR_THEMES: Record<SidebarThemeKey, SidebarThemeTokens> = {
  // Clean light-mode palette — near-white surface with soft gray hover.
  light: {
    sidebar:                 'oklch(0.985 0 0)',
    sidebarForeground:       'oklch(0.205 0 0)',
    sidebarBorder:           'oklch(0.922 0 0)',
    sidebarAccent:           'oklch(0.955 0 0)',
    sidebarAccentForeground: 'oklch(0.145 0 0)',
    mutedForeground:         'oklch(0.556 0 0)',
  },
  // Stripe-style deep navy.
  navy: {
    sidebar:                 'oklch(0.190 0.035 255)',
    sidebarForeground:       'oklch(0.975 0.005 250)',
    sidebarBorder:           'oklch(0.285 0.040 255)',
    sidebarAccent:           'oklch(0.285 0.040 255)',
    sidebarAccentForeground: 'oklch(1 0 0)',
    mutedForeground:         'oklch(0.720 0.025 250)',
  },
  // Zoho-style gunmetal blue.
  zoho: {
    sidebar:                 'oklch(0.225 0.022 250)',
    sidebarForeground:       'oklch(0.970 0.005 250)',
    sidebarBorder:           'oklch(0.305 0.028 250)',
    sidebarAccent:           'oklch(0.305 0.028 250)',
    sidebarAccentForeground: 'oklch(1 0 0)',
    mutedForeground:         'oklch(0.720 0.018 250)',
  },
  // Linear / Vercel slate-900.
  slate: {
    sidebar:                 'oklch(0.208 0.042 265.755)',
    sidebarForeground:       'oklch(0.968 0.007 247.896)',
    sidebarBorder:           'oklch(0.279 0.041 260.031)',
    sidebarAccent:           'oklch(0.279 0.041 260.031)',
    sidebarAccentForeground: 'oklch(1 0 0)',
    mutedForeground:         'oklch(0.704 0.04 256.788)',
  },
  // GitHub / Notion pure neutral black.
  neutral: {
    sidebar:                 'oklch(0.145 0 0)',
    sidebarForeground:       'oklch(0.985 0 0)',
    sidebarBorder:           'oklch(0.269 0 0)',
    sidebarAccent:           'oklch(0.269 0 0)',
    sidebarAccentForeground: 'oklch(1 0 0)',
    mutedForeground:         'oklch(0.708 0 0)',
  },
}

export const DEFAULT_SIDEBAR_THEME: SidebarThemeKey = 'light'

export function getSidebarTheme(key: string | null | undefined): SidebarThemeTokens {
  if (key && key in SIDEBAR_THEMES) {
    return SIDEBAR_THEMES[key as SidebarThemeKey]
  }
  return SIDEBAR_THEMES[DEFAULT_SIDEBAR_THEME]
}
