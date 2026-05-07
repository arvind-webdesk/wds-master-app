'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import {
  LayoutDashboard, Users, Shield, Mail, Activity,
  FileText, Settings, HelpCircle, Sparkles,
  LogOut, User, Plug, PanelLeft, History, Clock,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ClientConfig } from '@/lib/client-config'
import { getSidebarTheme } from './sidebar-themes'

// Each entry may be tied to a module key. If set and the gate is false, the
// entry is hidden. Entries with no moduleKey always show.
// middlewareOnly = true means the entry is only relevant for middleware OR custom dashboards.
const NAV_ITEMS: Array<{
  href:            string
  label:           string
  icon:            typeof LayoutDashboard
  moduleKey?:      string
  middlewareOnly?: boolean
  /** Hidden unless the current user can update OnboardingConfig. */
  requiresSetup?:  boolean
}> = [
  { href: '/dashboard',        label: 'Dashboard',        icon: LayoutDashboard, moduleKey: 'dashboard'       },
  { href: '/connections',      label: 'Connections',      icon: Plug,            moduleKey: 'connections',    middlewareOnly: true },
  { href: '/users',            label: 'Users',            icon: Users,           moduleKey: 'users'           },
  { href: '/roles',            label: 'Roles',            icon: Shield,          moduleKey: 'roles'           },
  { href: '/email-templates',  label: 'Email Templates',  icon: Mail,            moduleKey: 'email-templates' },
  { href: '/activity-logs',    label: 'Activity Logs',    icon: Activity,        moduleKey: 'activity-logs'   },
  { href: '/api-logs',         label: 'API Logs',         icon: FileText,        moduleKey: 'api-logs'        },
  { href: '/sync-history',     label: 'Sync History',     icon: History,         moduleKey: 'sync-history',   middlewareOnly: true },
  { href: '/cron-sync',        label: 'Cron Sync',        icon: Clock,           moduleKey: 'cron-sync',      middlewareOnly: true },
  { href: '/settings',                label: 'System Settings',  icon: Settings,    moduleKey: 'settings' },
  { href: '/settings/dashboard-setup', label: 'Dashboard Setup',  icon: Sparkles,    requiresSetup: true },
  { href: '/settings/account',         label: 'My Account',       icon: User },
  { href: '/help',                     label: 'Help',             icon: HelpCircle },
]

interface SidebarProps {
  user?:           { email?: string; firstName?: string; lastName?: string; image?: string }
  clientConfig:    ClientConfig
  enabledModules:  ReadonlyArray<string>
  /** True only for `userType === 'superadmin'`. Controls visibility of the Dashboard Setup nav. */
  isSuperadmin:    boolean
}

export function Sidebar({ user, clientConfig, enabledModules, isSuperadmin }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const enabledSet     = new Set(enabledModules)
  const supportsIntegrations =
    clientConfig.dashboardType === 'middleware' || clientConfig.dashboardType === 'custom'

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.moduleKey && !enabledSet.has(item.moduleKey)) return false
    if (item.middlewareOnly && !supportsIntegrations) return false
    if (item.requiresSetup && !isSuperadmin) return false
    return true
  })

  // Sidebar gets its own scoped palette (selected in setup wizard).
  const theme = getSidebarTheme(clientConfig.sidebarTheme)
  const themeVars: React.CSSProperties = {
    ['--sidebar' as string]:                   theme.sidebar,
    ['--sidebar-foreground' as string]:        theme.sidebarForeground,
    ['--sidebar-border' as string]:            theme.sidebarBorder,
    ['--sidebar-accent' as string]:            theme.sidebarAccent,
    ['--sidebar-accent-foreground' as string]: theme.sidebarAccentForeground,
    ['--border' as string]:                    theme.sidebarBorder,
    ['--foreground' as string]:                theme.sidebarForeground,
    ['--muted' as string]:                     theme.sidebarAccent,
    ['--muted-foreground' as string]:          theme.mutedForeground,
  }

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'U'

  return (
    <TooltipProvider>
      <motion.aside
        animate={{ width: collapsed ? 56 : 224 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        style={themeVars}
        className="group/sidebar relative hidden lg:flex flex-col h-screen border-r border-sidebar-border bg-sidebar text-sidebar-foreground shrink-0"
      >
        {/* Logo / Brand */}
        <div className="flex items-center h-14 px-3 border-b border-border shrink-0 gap-2 overflow-hidden">
          {clientConfig.brandLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={clientConfig.brandLogoUrl}
              alt={`${clientConfig.name} logo`}
              className="h-7 w-7 rounded-md object-contain shrink-0"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold shrink-0">
              {clientConfig.name.charAt(0).toUpperCase()}
            </div>
          )}
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="brand"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="font-semibold text-sm text-foreground truncate flex-1 min-w-0"
              >
                {clientConfig.name}
              </motion.span>
            )}
          </AnimatePresence>

          {/* Collapse/expand toggle — lives inside the header, like ChatGPT */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'shrink-0 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all duration-150',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed
                ? 'mx-auto opacity-0 pointer-events-none group-hover/sidebar:opacity-100 group-hover/sidebar:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto'
                : 'opacity-100',
            )}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
          {visibleNavItems.map(({ href, label, icon: Icon }) => {
            // Exact match for leaf routes; prefix match otherwise,
            // but /settings must not also activate /settings/account.
            const active =
              pathname === href ||
              (href !== '/settings' && pathname.startsWith(href + '/'))
            const item = (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 mx-2 rounded-[0.5rem] text-sm transition-colors',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-muted-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      key={label}
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="truncate"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={href}>
                  <TooltipTrigger render={item} />
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              )
            }
            return item
          })}
        </nav>

        {/* User + Sign out */}
        <div className="border-t border-border p-2 shrink-0">
          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-2 hover:bg-sidebar-accent transition-colors',
              collapsed && 'justify-center px-0',
            )}
          >
            <Avatar className="h-8 w-8 shrink-0 ring-1 ring-border">
              <AvatarImage src={user?.image} />
              <AvatarFallback className="text-[10px] font-semibold bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  key="user-info"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-w-0 leading-tight"
                >
                  <p className="text-xs font-medium truncate text-foreground">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                </motion.div>
              )}
            </AnimatePresence>
            {!collapsed && (
              <button
                onClick={handleSignOut}
                className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

      </motion.aside>
    </TooltipProvider>
  )
}
