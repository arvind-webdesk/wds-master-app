import { redirect } from 'next/navigation'
import { ThemeProvider } from 'next-themes'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { AbilityProvider } from '@/lib/acl/ability-context'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { CommandPalette } from '@/components/shell/CommandPalette'
import { Toaster } from '@/components/ui/sonner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const ability = defineAbilityFor(user)

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AbilityProvider ability={ability}>
        <div className="flex h-screen overflow-hidden bg-background">
          {/* Left sidebar */}
          <Sidebar user={user} />

          {/* Main content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar user={user} />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>

        {/* Command palette — listens globally for ⌘K */}
        <CommandPalette />

        {/* Toast notifications */}
        <Toaster richColors position="top-right" />
      </AbilityProvider>
    </ThemeProvider>
  )
}
