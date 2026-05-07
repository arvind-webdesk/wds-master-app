import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { AbilityProvider } from '@/lib/acl/ability-context'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { CommandPalette } from '@/components/shell/CommandPalette'
import { SetupBanner } from '@/components/shell/SetupBanner'
import { BrandStyle } from '@/components/shell/BrandStyle'
import { Toaster } from '@/components/ui/sonner'
import { getClientConfig, getEnabledModules } from '@/lib/client-config'
import { ClientConfigProvider } from '@/lib/client-config-context'

export async function generateMetadata(): Promise<Metadata> {
  const clientConfig = await getClientConfig()

  return {
    icons: clientConfig.brandFaviconUrl
      ? {
          icon: [{ url: clientConfig.brandFaviconUrl }],
          shortcut: [{ url: clientConfig.brandFaviconUrl }],
        }
      : undefined,
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const ability       = defineAbilityFor(user)
  const clientConfig  = await getClientConfig()
  const enabledSet    = await getEnabledModules()
  const enabledModules = Array.from(enabledSet)

  // Dashboard Setup is locked to superadmins by user type — not driven by CASL
  // permission rows — so a regular role can't accidentally be granted it.
  const isSuperadmin  = user.userType === 'superadmin'
  const setupComplete = clientConfig.completedAt != null

  return (
    <AbilityProvider rules={ability.rules}>
      <ClientConfigProvider config={clientConfig}>
      <BrandStyle clientConfig={clientConfig} />
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Left sidebar */}
        <Sidebar user={user} clientConfig={clientConfig} enabledModules={enabledModules} isSuperadmin={isSuperadmin} />

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar user={user} clientConfig={clientConfig} enabledModules={enabledModules} isSuperadmin={isSuperadmin} />
          <SetupBanner visible={!setupComplete} canEdit={isSuperadmin} />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>

      {/* Command palette — listens globally for ⌘K */}
      <CommandPalette />

      {/* Toast notifications */}
      <Toaster richColors position="top-right" />
      </ClientConfigProvider>
    </AbilityProvider>
  )
}
