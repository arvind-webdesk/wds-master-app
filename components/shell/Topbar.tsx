'use client'

import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { Search, Bell, Sun, Moon, Monitor, LogOut, User, ChevronDown, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Sidebar } from './Sidebar'
import { OPEN_COMMAND_PALETTE_EVENT } from './CommandPalette'

interface TopbarProps {
  user?: { email?: string; firstName?: string; lastName?: string; image?: string }
}

export function Topbar({ user }: TopbarProps) {
  const { setTheme } = useTheme()
  const router = useRouter()

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'U'

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background px-4">

      {/* Mobile sidebar trigger — @base-ui uses render prop, not asChild */}
      <Sheet>
        <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" />}>
          <Menu className="h-4 w-4" />
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-56">
          <Sidebar user={user} />
        </SheetContent>
      </Sheet>

      {/* Command palette trigger */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT))}
        className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors w-48 sm:w-64"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-background px-1.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">

        {/* Theme toggle — render prop instead of asChild */}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun className="mr-2 h-4 w-4" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon className="mr-2 h-4 w-4" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor className="mr-2 h-4 w-4" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications bell */}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 relative" />}>
            <Bell className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="font-medium text-sm text-foreground">
              Notifications
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Bell className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No notifications yet</p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu — DropdownMenuTrigger renders as <button> by default; pass className directly */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted transition-colors">
            <Avatar className="h-7 w-7">
              <AvatarImage src={user?.image} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden sm:block text-sm font-medium">
              {user?.firstName} {user?.lastName}
            </span>
            <ChevronDown className="hidden sm:block h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings/account')}>
              <User className="mr-2 h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </header>
  )
}
