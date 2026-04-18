'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  LayoutDashboard, Users, Shield, Mail,
  Activity, FileText, Settings, HelpCircle, Plus, User,
} from 'lucide-react'
import { useAbility } from '@/lib/acl/ability-context'

/** Fired by the search button in Topbar — avoids spoofing keyboard events */
export const OPEN_COMMAND_PALETTE_EVENT = 'open-command-palette'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ability = useAbility()

  const NAV_COMMANDS = [
    ...(ability.can('read', 'Dashboard')
      ? [{ label: 'Go to Dashboard', href: '/dashboard', icon: LayoutDashboard }]
      : []),
    { label: 'Users',           href: '/users',            icon: Users },
    { label: 'Roles',           href: '/roles',            icon: Shield },
    { label: 'Email Templates', href: '/email-templates',  icon: Mail },
    { label: 'Activity Logs',   href: '/activity-logs',    icon: Activity },
    { label: 'API Logs',        href: '/api-logs',         icon: FileText },
    { label: 'System Settings', href: '/settings',         icon: Settings },
    { label: 'My Account',      href: '/settings/account', icon: User },
    { label: 'Help',            href: '/help',             icon: HelpCircle },
  ]

  const ACTION_COMMANDS = [
    { label: 'New User',           href: '/users?create=true',          icon: Plus },
    { label: 'New Email Template', href: '/email-templates?create=true', icon: Plus },
  ]

  useEffect(() => {
    // ⌘K / Ctrl+K keyboard shortcut
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    // Custom event dispatched by the Topbar search button
    function handleCustomOpen() {
      setOpen((o) => !o)
    }

    document.addEventListener('keydown', handleKeydown)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handleCustomOpen)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handleCustomOpen)
    }
  }, [])

  function navigate(href: string) {
    router.push(href)
    setOpen(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_COMMANDS.map(({ label, href, icon: Icon }) => (
            <CommandItem key={href} onSelect={() => navigate(href)}>
              <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          {ACTION_COMMANDS.map(({ label, href, icon: Icon }) => (
            <CommandItem key={href} onSelect={() => navigate(href)}>
              <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
