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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncHistoryFilters {
  q: string
  platform: string
  target: string
  status: string
  connectionId: string
  dateFrom: string
  dateTo: string
}

export interface ConnectionOption {
  id: number
  name: string
  type: string
}

interface SyncHistoryToolbarProps {
  filters: SyncHistoryFilters
  connections: ConnectionOption[]
  connectionsLoading?: boolean
  onFiltersChange: (next: Partial<SyncHistoryFilters>) => void
  onClear: () => void
  onRefresh: () => void
  isLoading?: boolean
}

// ─── Date range presets ───────────────────────────────────────────────────────

type Preset = { label: string; from: () => string; to: () => string }
const PRESETS: Preset[] = [
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

// ─── Component ────────────────────────────────────────────────────────────────

export function SyncHistoryToolbar({
  filters,
  connections,
  connectionsLoading,
  onFiltersChange,
  onClear,
  onRefresh,
  isLoading,
}: SyncHistoryToolbarProps) {
  const [localQ, setLocalQ] = useState(filters.q)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep localQ in sync when parent clears filters
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
    filters.q || filters.platform || filters.target ||
    filters.status || filters.connectionId ||
    filters.dateFrom || filters.dateTo

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1 — search + selects + refresh */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search error messages…"
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

        {/* Platform */}
        <Select
          value={filters.platform || '_any'}
          onValueChange={(v) => onFiltersChange({ platform: !v || v === '_any' ? '' : v })}
        >
          <SelectTrigger size="sm" className="h-8 min-w-[110px] text-xs">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any">Any platform</SelectItem>
            <SelectItem value="shopify">Shopify</SelectItem>
            <SelectItem value="bigcommerce">BigCommerce</SelectItem>
          </SelectContent>
        </Select>

        {/* Target */}
        <Select
          value={filters.target || '_any'}
          onValueChange={(v) => onFiltersChange({ target: !v || v === '_any' ? '' : v })}
        >
          <SelectTrigger size="sm" className="h-8 min-w-[100px] text-xs">
            <SelectValue placeholder="Target" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any">Any target</SelectItem>
            <SelectItem value="products">Products</SelectItem>
            <SelectItem value="orders">Orders</SelectItem>
            <SelectItem value="customers">Customers</SelectItem>
          </SelectContent>
        </Select>

        {/* Status */}
        <Select
          value={filters.status || '_any'}
          onValueChange={(v) => onFiltersChange({ status: !v || v === '_any' ? '' : v })}
        >
          <SelectTrigger size="sm" className="h-8 min-w-[90px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any">Any status</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        {/* Connection */}
        <Select
          value={filters.connectionId || '_any'}
          onValueChange={(v) => onFiltersChange({ connectionId: !v || v === '_any' ? '' : v })}
          disabled={connectionsLoading}
        >
          <SelectTrigger size="sm" className="h-8 min-w-[130px] text-xs">
            <SelectValue placeholder={connectionsLoading ? 'Loading…' : 'Connection'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_any">Any connection</SelectItem>
            {connections.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name} ({c.type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

      {/* Row 2 — date range presets + custom inputs */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Range:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onFiltersChange({ dateFrom: p.from(), dateTo: p.to() })}
            className="rounded px-2 py-0.5 text-[11px] border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onFiltersChange({ dateFrom: '', dateTo: '' })}
          className="rounded px-2 py-0.5 text-[11px] border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          All time
        </button>
        <div className="flex items-center gap-1 ml-1">
          <Input
            type="datetime-local"
            value={filters.dateFrom ? filters.dateFrom.slice(0, 16) : ''}
            onChange={(e) => onFiltersChange({ dateFrom: e.target.value ? new Date(e.target.value).toISOString() : '' })}
            className="h-7 text-[11px] w-[155px] px-2"
            title="From"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            type="datetime-local"
            value={filters.dateTo ? filters.dateTo.slice(0, 16) : ''}
            onChange={(e) => onFiltersChange({ dateTo: e.target.value ? new Date(e.target.value).toISOString() : '' })}
            className="h-7 text-[11px] w-[155px] px-2"
            title="To"
          />
        </div>
      </div>
    </div>
  )
}
