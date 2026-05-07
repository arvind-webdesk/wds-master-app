'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, AlertCircle } from 'lucide-react'
import cronstrue from 'cronstrue'
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { applyServerErrors, parseFetchError } from '@/lib/form-errors'
import type { SyncScheduleRow } from './cron-sync-columns'

/**
 * Sync-schedule create/edit form. Used on dedicated pages — never inside a
 * Sheet (per .claude/skills/record-form-layout/SKILL.md, this form has 4
 * fields → page).
 */

function tryDescribeCron(expr: string): { ok: true; text: string } | { ok: false } {
  try {
    return { ok: true, text: cronstrue.toString(expr.trim()) }
  } catch {
    return { ok: false }
  }
}

const schema = z.object({
  connectionId:   z.number({ message: 'Connection is required' }).int().positive(),
  target:         z.enum(['products', 'orders', 'customers'], { message: 'Target is required' }),
  cronExpression: z.string().trim().min(9, 'Cron expression is too short').max(120, 'Cron expression is too long'),
  enabled:        z.boolean(),
})

type FormValues = z.infer<typeof schema>

interface Connection {
  id:       number
  name:     string
  platform: string
  type?:    string
}

interface Props {
  mode:     'create' | 'edit'
  schedule?: SyncScheduleRow
}

const PRESETS = [
  { label: 'Every hour',         value: '0 * * * *'   },
  { label: 'Every 6 hours',      value: '0 */6 * * *' },
  { label: 'Daily at midnight',  value: '0 0 * * *'   },
]

export function CronSyncForm({ mode, schedule }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      connectionId:   schedule?.connectionId ?? (undefined as unknown as number),
      target:         schedule?.target       ?? (undefined as unknown as 'products'),
      cronExpression: schedule?.cronExpression ?? '',
      enabled:        schedule?.enabled ?? true,
    },
  })

  const watchedCron = form.watch('cronExpression')
  const cronPreview = tryDescribeCron(watchedCron)

  useEffect(() => {
    setLoadingConnections(true)
    fetch('/api/connections?limit=100')
      .then((r) => r.json())
      .then((json) => setConnections(json.data ?? []))
      .catch(() => toast.error('Failed to load connections'))
      .finally(() => setLoadingConnections(false))
  }, [])

  function onSubmit(values: FormValues) {
    form.clearErrors()
    startTransition(async () => {
      let res: Response
      try {
        if (mode === 'create') {
          res = await fetch('/api/cron-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
          })
        } else {
          // Only send dirty fields on PATCH so we don't reset connection accidentally.
          const dirty = form.formState.dirtyFields
          const patch: Partial<FormValues> = {}
          if (dirty.connectionId)   patch.connectionId   = values.connectionId
          if (dirty.target)         patch.target         = values.target
          if (dirty.cronExpression) patch.cronExpression = values.cronExpression
          if (dirty.enabled !== undefined) patch.enabled = values.enabled

          res = await fetch(`/api/cron-sync/${schedule!.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          })
        }
      } catch {
        const message = 'Could not reach the server. Check your connection and try again.'
        form.setError('root', { type: 'network', message })
        toast.error(message)
        return
      }

      if (!res.ok) {
        const payload = await parseFetchError(res)
        if (res.status === 409) {
          form.setError('target', {
            type: 'server',
            message: payload.message ?? 'A schedule already exists for this connection and target',
          })
          return
        }
        applyServerErrors(form, payload, { fallbackField: 'cronExpression' })
        return
      }

      toast.success(mode === 'create' ? 'Schedule created' : 'Schedule updated')
      router.push('/cron-sync')
      router.refresh()
    })
  }

  const rootError = form.formState.errors.root?.message

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-xl" noValidate>
        {rootError ? (
          <div
            role="alert"
            aria-live="polite"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{rootError}</p>
          </div>
        ) : null}

        <FormField
          control={form.control}
          name="connectionId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Connection</FormLabel>
              <Select
                value={loadingConnections ? '' : (field.value ? String(field.value) : '')}
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

        <FormField
          control={form.control}
          name="target"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target</FormLabel>
              <Select value={field.value ?? ''} onValueChange={(v) => { if (v) field.onChange(v) }}>
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
                  autoComplete="off"
                  spellCheck={false}
                />
              </FormControl>
              <FormDescription className="text-xs">
                Minute Hour DayOfMonth Month DayOfWeek — e.g. <code className="font-mono">0 */6 * * *</code>
              </FormDescription>
              {watchedCron.trim().length > 0 ? (
                <p className={`text-xs mt-1 ${cronPreview.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                  {cronPreview.ok ? cronPreview.text : 'Invalid cron expression'}
                </p>
              ) : null}
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
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Create schedule' : 'Save changes'}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            nativeButton={false}
            render={<Link href="/cron-sync" />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
