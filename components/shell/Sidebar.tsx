'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import {
  LayoutDashboard, Users, Shield, Mail, Activity,
  FileText, Settings, HelpCircle, ChevronLeft,
  ChevronRight, LogOut, Menu, User,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { CLIENT_CONFIG, isModuleEnabled } from '@/lib/client-config'

// Each entry may be tied to a module key — if set and the module is disabled
// in client-config, the entry is hidden. Entries without moduleKey always show.
const NAV_ITEMS: Array<{
  href:       string
  label:      string
  icon:       typeof LayoutDashboard
  moduleKey?: string
}> = [
  { href: '/dashboard',        label: 'Dashboard',        icon: LayoutDashboard, moduleKey: 'dashboard'       },
  { href: '/users',            label: 'Users',            icon: Users,           moduleKey: 'users'           },
  { href: '/roles',            label: 'Roles',            icon: Shield,          moduleKey: 'roles'           },
  { href: '/email-templates',  label: 'Email Templates',  icon: Mail,            moduleKey: 'email-templates' },
  { href: '/activity-logs',    label: 'Activity Logs',    icon: Activity,        moduleKey: 'activity-logs'   },
  { href: '/api-logs',         label: 'API Logs',         icon: FileText,        moduleKey: 'api-logs'        },
  { href: '/settings',         label: 'System Settings',  icon: Settings,        moduleKey: 'settings'        },
  { href: '/settings/account', label: 'My Account',       icon: User                                          },
  { href: '/help',             label: 'Help',             icon: HelpCircle                                    },
]

const VISIBLE_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.moduleKey || isModuleEnabled(item.moduleKey))

interface SidebarProps {
  user?: { email?: string; firstName?: string; lastName?: string; image?: string }
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'U'

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        animate={{ width: collapsed ? 56 : 224 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="relative hidden lg:flex flex-col h-screen border-r border-border bg-sidebar shrink-0 overflow-hidden"
      >
        {/* Logo / Brand */}
        <div className="flex items-center h-14 px-3 border-b border-border shrink-0 gap-2">
          {CLIENT_CONFIG.brandLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={CLIENT_CONFIG.brandLogoUrl}
              alt={`${CLIENT_CONFIG.name} logo`}
              className="h-7 w-7 rounded-md object-contain shrink-0"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold shrink-0">
              {CLIENT_CONFIG.name.charAt(0).toUpperCase()}
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
                className="font-semibold text-sm text-foreground truncate"
              >
                {CLIENT_CONFIG.name}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
          {VISIBLE_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
        <div className="border-t border-border p-3 shrink-0">
          <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={user?.image} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  key="user-info"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-w-0"
                >
                  <p className="text-xs font-medium truncate">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </motion.div>
              )}
            </AnimatePresence>
            {!collapsed && (
              <button
                onClick={handleSignOut}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </motion.aside>
    </TooltipProvider>
  )
}
