'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'

const DISMISS_KEY = 'wds-setup-banner-dismissed-v1'

interface SetupBannerProps {
  /** Render only when setup hasn't been completed yet. */
  visible: boolean
  /** Whether the current user can edit dashboard setup (CASL gate). */
  canEdit: boolean
}

/**
 * First-run banner that nudges the super admin into the setup wizard.
 * Hides itself for the rest of the session if dismissed.
 */
export function SetupBanner({ visible, canEdit }: SetupBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return window.sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })

  if (!visible || !canEdit || dismissed) return null

  function dismiss() {
    setDismissed(true)
    try { window.sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-4 py-2 text-sm">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
      <p className="flex-1 text-foreground">
        Finish setting up your dashboard — pick branding, modules, and integrations.
      </p>
      <Link
        href="/settings/dashboard-setup"
        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        Open setup
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
