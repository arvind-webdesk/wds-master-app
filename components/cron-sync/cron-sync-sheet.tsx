'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import cronstrue from 'cronstrue'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SyncScheduleRow } from './cron-sync-columns'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function safeJson(res: Response): Promise<{ data?: unknown; error?: { message?: string; code?: string } }> {
  try {
    const text = await res.text()
    if (!text) return {}
    return JSON.parse(text)
  } catch {
    return { error: { message: `Request failed with status ${res.status}` } }
  }
}

function tryDescribeCron(expr: string): { ok: true; text: string } | { ok: false } {
  try {
    return { ok: true, text: cronstrue.toString(expr.trim()) }
  } catch {
    return { ok: false }
  }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const schema = z.object({
  connectionId: z.number({ message: 'Connection is required' }).int().positive(),
  target: z.enum(['products', 'orders', 'customers'], { message: 'Target is required' }),
  cronExpression: z
    .string()
    .trim()
    .min(9, 'Cron expression is too short')
    .max(120, 'Cron expression is too long'),
  enabled: z.boolean(),
})

type FormValues = z.infer<typeof schema>

// ─── Types ───────────────────────────────────────────────────────────────────

interface Connection {
  id: number
  name: string
  platform: string
  type?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  mode: 'create' | 'edit'
  schedule?: SyncScheduleRow | null
}

// ─── Preset buttons ──────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
]

// ─── Sheet ───────────────────────────────────────────────────────────────────

export function CronSyncSheet({ open, onOpenChange, onSaved, mode, schedule }: Props) {
  const [pending, startTransition] = useTransition()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      connectionId: undefined as unknown as number,
      target: undefined as unknown as 'products',
      cronExpression: '',
      enabled: true,
    },
  })

  const watchedCron = form.watch('cronExpression')
  const cronPreview = tryDescribeCron(watchedCron)

  // Load connections when sheet opens
  useEffect(() => {
    if (!open) return
    setLoadingConnections(true)
    fetch('/api/connections?limit=100')
      .then((r) => r.json())
      .then((json) => setConnections(json.data ?? []))
      .catch(() => toast.error('Failed to load connections'))
      .finally(() => setLoadingConnections(false))
  }, [open])

  // Populate form in edit mode
  useEffect(() => {
    if (mode === 'edit' && schedule && open) {
      form.reset({
        connectionId: schedule.connectionId,
        target: schedule.target,
        cronExpression: schedule.cronExpression,
        enabled: schedule.enabled,
      })
    } else if (mode === 'create' && open) {
      form.reset({
        connectionId: undefined as unknown as number,
        target: undefined as unknown as 'products',
        cronExpression: '',
        enabled: true,
      })
    }
  }, [mode, schedule, open]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      let res: Response
      if (mode === 'create') {
        res = await fetch('/api/cron-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        })
      } else {
        // Only send changed fields
        const dirty = form.formState.dirtyFields
        const patch: Partial<FormValues> = {}
        if (dirty.connectionId) patch.connectionId = values.connectionId
        if (dirty.target) patch.target = values.target
        if (dirty.cronExpression) patch.cronExpression = values.cronExpression
        if (dirty.enabled !== undefined) patch.enabled = values.enabled

        res = await fetch(`/api/cron-sync/${schedule!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
      }

      const json = await safeJson(res)

      if (!res.ok) {
        if (res.status === 409) {
          form.setError('target', { message: json.error?.message ?? 'A schedule already exists for this connection and target' })
          return
        }
        if (res.status === 422 && json.error?.message) {
          toast.error(json.error.message)
          return
        }
        toast.error(json.error?.message ?? (mode === 'create' ? 'Failed to create schedule' : 'Failed to save schedule'))
        return
      }

      toast.success(mode === 'create' ? 'Schedule created' : 'Schedule updated')
      form.reset()
      onSaved()
      onOpenChange(false)
    })
  }

  const isDirty = form.formState.isDirty

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isDirty) {
      if (!window.confirm('You have unsaved changes. Discard them?')) return
    }
    onOpenChange(nextOpen)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {mode === 'create' ? 'New schedule' : `Edit schedule — ${schedule?.connection.name ?? ''}`}
          </SheetTitle>
          <SheetDescription>
            {mode === 'create'
              ? 'Create a new recurring sync schedule.'
              : 'Update the schedule configuration.'}
          </SheetDescription>
        </SheetHeader>

        <div className="p-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              {/* Connection */}
              <FormField
                control={form.control}
                name="connectionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Connection</FormLabel>
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => field.onChange(Number(v))}
                      disabled={loadingConnections || mode === 'edit'}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={loadingConnections ? 'Loading...' : 'Select connection'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {connections.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            <span className="flex items-center gap-1.5">
                              <span>{c.name}</span>
                              <span className="text-[10px] text-muted-foreground capitalize">
                                ({c.platform ?? c.type})
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Target */}
              <FormField
                control={form.control}
                name="target"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target</FormLabel>
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select target" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="products">Products</SelectItem>
                        <SelectItem value="orders">Orders</SelectItem>
                        <SelectItem value="customers">Customers</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Cron expression */}
              <FormField
                control={form.control}
                name="cronExpression"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cron expression</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="font-mono"
                        placeholder="0 */6 * * *"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Minute Hour DayOfMonth Month DayOfWeek — e.g. <code className="font-mono">0 */6 * * *</code>
                    </FormDescription>

                    {/* Live preview */}
                    {watchedCron.trim().length > 0 && (
                      <p className={`text-xs mt-1 ${cronPreview.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                        {cronPreview.ok ? cronPreview.text : 'Invalid cron expression'}
                      </p>
                    )}

                    {/* Preset buttons */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          className="rounded border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                          onClick={() => {
                            field.onChange(preset.value)
                            form.trigger('cronExpression')
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Enabled */}
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between rounded-[0.625rem] border border-border p-3">
                      <div>
                        <FormLabel className="text-sm font-medium">
                          {field.value ? 'Enabled' : 'Disabled'}
                        </FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          When disabled, the schedule will not trigger automatic runs.
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <SheetFooter className="px-0 pb-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === 'create' ? 'Create schedule' : 'Save changes'}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
