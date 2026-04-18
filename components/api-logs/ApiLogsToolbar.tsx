'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export interface ApiLogsFilters {
  q: string
  method: string
  status: string
  errorOnly: boolean
  from: string
  to: string
  environment: string
}

interface ApiLogsToolbarProps {
  filters: ApiLogsFilters
  onFiltersChange: (next: Partial<ApiLogsFilters>) => void
  onClear: () => void
  onRefresh: () => void
  isLoading?: boolean
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
const STATUS_BUCKETS = ['2xx', '3xx', '4xx', '5xx']
const ENVIRONMENTS = ['development', 'production', 'staging', 'test']

// Date range presets
type Preset = { label: string; from: () => string; to: () => string }
const PRESETS: Preset[] = [
  {
    label: 'Last 15m',
    from: () => new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    to:   () => new Date().toISOString(),
  },
  {
    label: 'Last 1h',
    from: () => new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    to:   () => new Date().toISOString(),
  },
  {
    label: 'Last 24h',
    from: () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    to:   () => new Date().toISOString(),
  },
  {
    label: 'Last 7d',
    from: () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    to:   () => new Date().toISOString(),
  },
  {
    label: 'Last 30d',
    from: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    to:   () => new Date().toISOString(),
  },
]

export function ApiLogsToolbar({
  filters,
  onFiltersChange,
  onClear,
  onRefresh,
  isLoading,
}: ApiLogsToolbarProps) {
  const [localQ, setLocalQ] = useState(filters.q)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep localQ in sync if parent clears filters
  useEffect(() => {
    setLocalQ(filters.q)
  }, [filters.q])

  function handleQChange(val: string) {
    setLocalQ(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ q: val })
    }, 300)
  }

  const hasFilters =
    filters.q || filters.method || filters.status || filters.errorOnly ||
    filters.from || filters.to || filters.environment

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1 — search + primary filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search URL, message, error…"
            value={localQ}
            onChange={(e) => handleQChange(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
          {localQ && (
            <button
              type="button"
              onClick={() => { setLocalQ(''); onFiltersChange({ q: '' }) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Method */}
        <Select
          value={filters.method || '_any'}
          onValueChange={(v) => onFiltersChange({ method: v === '_any' ? '' : v })}
        >
          <SelectTrigger size="sm" className="h-8 min-w-[90px] text-xs">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any">Any method</SelectItem>
            {HTTP_METHODS.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status bucket */}
        <Select
          value={filters.status || '_any'}
          onValueChange={(v) => onFiltersChange({ status: v === '_any' ? '' : v })}
        >
          <SelectTrigger size="sm" className="h-8 min-w-[90px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any">Any status</SelectItem>
            {STATUS_BUCKETS.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Environment */}
        <Select
          value={filters.environment || '_any'}
          onValueChange={(v) => onFiltersChange({ environment: v === '_any' ? '' : v })}
        >
          <SelectTrigger size="sm" className="h-8 min-w-[110px] text-xs">
            <SelectValue placeholder="Environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any">Any env</SelectItem>
            {ENVIRONMENTS.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Errors only */}
        <div className="flex items-center gap-1.5 pl-1">
          <Switch
            id="error-only-toggle"
            checked={filters.errorOnly}
            onCheckedChange={(v) => onFiltersChange({ errorOnly: v })}
            className="h-4 w-7 data-[state=checked]:bg-rose-500"
          />
          <Label htmlFor="error-only-toggle" className="text-xs cursor-pointer select-none">
            Errors only
          </Label>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>

        {/* Clear */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Row 2 — date range presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Range:</span>
        {PRESETS.map((p) => {
          const active =
            filters.from === p.from() || // approximate match isn't perfect — use label tracking
            false
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onFiltersChange({ from: p.from(), to: p.to() })}
              className={`rounded px-2 py-0.5 text-[11px] border transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground border-transparent'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => onFiltersChange({ from: '', to: '' })}
          className="rounded px-2 py-0.5 text-[11px] border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          All time
        </button>
        {/* Custom date inputs */}
        <div className="flex items-center gap-1 ml-1">
          <Input
            type="datetime-local"
            value={filters.from ? filters.from.slice(0, 16) : ''}
            onChange={(e) => onFiltersChange({ from: e.target.value ? new Date(e.target.value).toISOString() : '' })}
            className="h-7 text-[11px] w-[155px] px-2"
            title="From"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            type="datetime-local"
            value={filters.to ? filters.to.slice(0, 16) : ''}
            onChange={(e) => onFiltersChange({ to: e.target.value ? new Date(e.target.value).toISOString() : '' })}
            className="h-7 text-[11px] w-[155px] px-2"
            title="To"
          />
        </div>
      </div>
    </div>
  )
}
