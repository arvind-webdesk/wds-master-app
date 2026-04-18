'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// ─── Known subject types from the CASL Subjects union (minus 'all') ───────────

const SUBJECT_TYPES = [
  'User',
  'Role',
  'Permission',
  'EmailTemplate',
  'ActivityLog',
  'ApiLog',
  'Setting',
  'Dashboard',
  'System',
]

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActivityLogFilters {
  search: string
  userId: string
  action: string
  subjectType: string
  dateFrom: string
  dateTo: string
}

interface ActivityLogsFiltersProps {
  filters: ActivityLogFilters
  onFiltersChange: (next: Partial<ActivityLogFilters>) => void
  onClearAll: () => void
}

// ─── User option (minimal shape from /api/users) ──────────────────────────────

type UserOption = { id: number; firstName: string; lastName: string; email: string }

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityLogsFilters({
  filters,
  onFiltersChange,
  onClearAll,
}: ActivityLogsFiltersProps) {
  // ── Search debounce ──
  const [localSearch, setLocalSearch] = useState(filters.search)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalSearch(filters.search)
  }, [filters.search])

  function handleSearchChange(value: string) {
    setLocalSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      onFiltersChange({ search: value })
    }, 300)
  }

  // ── User combobox state ──
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [userOpen, setUserOpen] = useState(false)
  const [usersLoaded, setUsersLoaded] = useState(false)

  async function loadUsers(q: string) {
    try {
      const qs = new URLSearchParams({ limit: '100' })
      if (q) qs.set('search', q)
      const res = await fetch(`/api/users?${qs}`)
      const json = await res.json()
      if (res.ok) setUserOptions(json.data ?? [])
    } catch {
      // silently ignore
    }
    setUsersLoaded(true)
  }

  useEffect(() => {
    if (userOpen && !usersLoaded) {
      loadUsers('')
    }
  }, [userOpen, usersLoaded])

  const userTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleUserSearchChange(value: string) {
    setUserSearch(value)
    if (userTimer.current) clearTimeout(userTimer.current)
    userTimer.current = setTimeout(() => {
      loadUsers(value)
    }, 300)
  }

  const selectedUser = userOptions.find((u) => String(u.id) === filters.userId) ?? null

  // ── Active filters check ──
  const hasActive =
    filters.search !== '' ||
    filters.userId !== '' ||
    filters.action !== '' ||
    filters.subjectType !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== ''

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search logs..."
          className="h-8 pl-8 text-xs w-48"
        />
      </div>

      {/* User combobox */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setUserOpen((o) => !o)}
          className="h-8 min-w-[140px] rounded-md border border-input bg-background px-2.5 text-xs text-left flex items-center justify-between gap-1 hover:border-foreground/30 transition-colors"
        >
          <span className={selectedUser ? 'text-foreground' : 'text-muted-foreground'}>
            {selectedUser
              ? `${selectedUser.firstName} ${selectedUser.lastName}`
              : 'All users'}
          </span>
          <svg
            className="h-3 w-3 text-muted-foreground shrink-0"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>

        {userOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 w-56 rounded-[0.625rem] border border-border bg-popover shadow-md overflow-hidden">
            <div className="p-1.5 border-b border-border">
              <input
                autoFocus
                value={userSearch}
                onChange={(e) => handleUserSearchChange(e.target.value)}
                placeholder="Search users..."
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              <button
                type="button"
                className="w-full text-left rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => {
                  onFiltersChange({ userId: '' })
                  setUserOpen(false)
                }}
              >
                All users
              </button>
              {userOptions
                .filter((u) => {
                  if (!userSearch) return true
                  const q = userSearch.toLowerCase()
                  return (
                    u.firstName.toLowerCase().includes(q) ||
                    u.lastName.toLowerCase().includes(q) ||
                    u.email.toLowerCase().includes(q)
                  )
                })
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={[
                      'w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors',
                      String(u.id) === filters.userId
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent hover:text-accent-foreground',
                    ].join(' ')}
                    onClick={() => {
                      onFiltersChange({ userId: String(u.id) })
                      setUserOpen(false)
                    }}
                  >
                    <span className="font-medium">
                      {u.firstName} {u.lastName}
                    </span>
                    <span className="ml-1.5 text-muted-foreground">{u.email}</span>
                  </button>
                ))}
              {usersLoaded && userOptions.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground text-center">No users found</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action input (exact match) */}
      <Input
        value={filters.action}
        onChange={(e) => onFiltersChange({ action: e.target.value })}
        placeholder="Action (exact)"
        className="h-8 text-xs w-36 font-mono"
      />

      {/* Subject type select */}
      <select
        value={filters.subjectType}
        onChange={(e) => onFiltersChange({ subjectType: e.target.value })}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All subjects</option>
        {SUBJECT_TYPES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {/* Date range */}
      <div className="flex items-center gap-1">
        <input
          type="datetime-local"
          value={filters.dateFrom}
          onChange={(e) => onFiltersChange({ dateFrom: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring w-44"
          title="From date"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="datetime-local"
          value={filters.dateTo}
          onChange={(e) => onFiltersChange({ dateTo: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring w-44"
          title="To date"
        />
      </div>

      {/* Clear all */}
      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2"
          onClick={onClearAll}
        >
          <X className="h-3 w-3" />
          Clear all
        </Button>
      )}
    </div>
  )
}
