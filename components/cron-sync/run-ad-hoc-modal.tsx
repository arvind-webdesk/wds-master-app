'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

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
  onJobStarted: (jobId: number) => void
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const schema = z.object({
  connectionId: z.number().int().positive('Connection is required'),
  target: z.enum(['products', 'orders', 'customers'], { message: 'Target is required' }),
})

type FormValues = z.infer<typeof schema>

// ─── Component ───────────────────────────────────────────────────────────────

export function RunAdHocModal({ open, onOpenChange, onJobStarted }: Props) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(false)
  const [pending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      target: undefined as unknown as 'products',
    },
  })

  // Load connections when modal opens
  useEffect(() => {
    if (!open) return
    setLoadingConnections(true)
    fetch('/api/connections?limit=100&status=active')
      .then((r) => r.json())
      .then((json) => {
        setConnections(json.data ?? [])
      })
      .catch(() => {
        toast.error('Failed to load connections')
      })
      .finally(() => setLoadingConnections(false))
  }, [open])

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const res = await fetch('/api/cron-sync/run-ad-hoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          toast.error(json.error?.message ?? 'A sync is already running for this connection and target')
          return
        }
        toast.error(json.error?.message ?? 'Failed to start sync')
        return
      }
      form.reset()
      onOpenChange(false)
      onJobStarted(json.data.jobId)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Run ad-hoc sync</DialogTitle>
          <DialogDescription>
            Select a connection and target to trigger a manual sync without a schedule.
          </DialogDescription>
        </DialogHeader>

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
                    disabled={loadingConnections}
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

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Run sync
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
