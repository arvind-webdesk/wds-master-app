'use client'

import { useEffect, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertCircle, Info, Loader2, Zap } from 'lucide-react'
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
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SafeConnection, ConnectionType, ConnectionStatus } from '@/lib/db/schema/connections'
import { isIntegrationEnabled } from '@/lib/client-config'

// Onboarding-time platform gate — matches the lock applied on the connections
// page. When only one platform is enabled for this dashboard the type select
// is hidden and the form is pre-seeded to that platform.
const SHOPIFY_ON     = isIntegrationEnabled('shopify')
const BIGCOMMERCE_ON = isIntegrationEnabled('bigcommerce')
const SINGLE_PLATFORM: ConnectionType | null =
  SHOPIFY_ON && !BIGCOMMERCE_ON ? 'shopify'
  : BIGCOMMERCE_ON && !SHOPIFY_ON ? 'bigcommerce'
  : null
const DEFAULT_TYPE: ConnectionType =
  SINGLE_PLATFORM ?? (BIGCOMMERCE_ON ? 'bigcommerce' : 'shopify')

// Safe JSON parse — returns null when the body is empty or malformed (e.g. a
// bare 500 from the dev server). Never lets the caller crash.
async function safeJson(res: Response): Promise<{ data?: unknown; error?: { message?: string; code?: string } }> {
  try {
    const text = await res.text()
    if (!text) return {}
    return JSON.parse(text)
  } catch {
    return { error: { message: `Request failed with status ${res.status}` } }
  }
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

// Flat form schema — credentials always present in state to avoid
// uncontrolled→controlled transitions. Per-type validation is done via superRefine
// so required/format rules apply only to the selected platform.
const createSchema = z
  .object({
    type: z.enum(['shopify', 'bigcommerce']),
    name: z.string().trim().min(1, 'Name is required').max(120),
    status: z.enum(['active', 'disabled', 'error']),
    storeIdentifier: z.string().trim().min(1, 'Store identifier is required').max(255),
    credentials: z.object({
      accessToken:  z.string().trim().max(500),
      clientId:     z.string().trim().max(200),
      clientSecret: z.string().trim().max(500),
    }),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'shopify') {
      if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(val.storeIdentifier)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['storeIdentifier'],
          message: 'Must be a valid *.myshopify.com domain',
        })
      }
      return
    }
    // bigcommerce
    if (!/^[a-z0-9]+$/i.test(val.storeIdentifier)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storeIdentifier'],
        message: 'Must be alphanumeric (no slashes)',
      })
    }
    if (val.credentials.accessToken.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credentials', 'accessToken'],
        message: 'Access token required (min 10 chars)',
      })
    }
    if (val.credentials.clientId.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credentials', 'clientId'],
        message: 'Client ID is required',
      })
    }
  })

// Edit schema — type is locked, storeIdentifier is locked
const editSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  status: z.enum(['active', 'disabled', 'error']),
  credentials: z
    .object({
      accessToken: z.string().trim().min(10).max(500).optional().or(z.literal('')),
      clientId: z.string().trim().min(1).max(200).optional().or(z.literal('')),
      clientSecret: z.string().trim().min(1).max(500).optional().or(z.literal('')),
    })
    .optional(),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  mode: 'create' | 'edit'
  connection?: SafeConnection | null
  /** Pre-select type on open (create mode only) */
  initialType?: ConnectionType
}

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateForm({
  onSaved,
  onOpenChange,
  initialType,
}: {
  onSaved: () => void
  onOpenChange: (open: boolean) => void
  initialType?: ConnectionType
}) {
  const [pending, startTransition] = useTransition()

  // When the dashboard is locked to one platform, ignore any stale `initialType`
  // that doesn't match — the select is hidden in that case and the form would
  // otherwise open showing the wrong platform's fields.
  const resolvedInitialType: ConnectionType =
    SINGLE_PLATFORM ?? initialType ?? DEFAULT_TYPE

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      type: resolvedInitialType,
      name: '',
      status: 'active',
      storeIdentifier: '',
      credentials: { accessToken: '', clientId: '', clientSecret: '' },
    },
  })

  const watchedType = form.watch('type')

  function onSubmit(values: CreateValues) {
    if (values.type === 'shopify') {
      // Should not happen — submit is disabled. OAuth flow is the path.
      return
    }
    startTransition(async () => {
      const body = {
        type:            'bigcommerce' as const,
        name:            values.name,
        status:          values.status,
        storeIdentifier: values.storeIdentifier,
        credentials: {
          storeHash:    values.storeIdentifier,
          accessToken:  values.credentials.accessToken,
          clientId:     values.credentials.clientId,
          clientSecret: values.credentials.clientSecret || undefined,
        },
      }
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await safeJson(res)) as { data?: { ok?: boolean; error?: string }; error?: { message?: string; code?: string } }
      if (!res.ok) {
        if (res.status === 409) {
          form.setError('storeIdentifier', { message: json.error?.message ?? 'Already exists' })
          return
        }
        if (res.status === 422 && json.error?.message) {
          toast.error(json.error.message)
          return
        }
        toast.error(json.error?.message ?? 'Failed to create connection')
        return
      }
      toast.success('Connection created')
      form.reset()
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Acme Prod Store" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Type — hidden when the dashboard is locked to a single platform.
            The form value stays set via defaultValues / resolvedInitialType. */}
        {!SINGLE_PLATFORM && (
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Platform type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SHOPIFY_ON     && <SelectItem value="shopify">Shopify</SelectItem>}
                    {BIGCOMMERCE_ON && <SelectItem value="bigcommerce">BigCommerce</SelectItem>}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Status */}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="error" disabled>Error (system-set)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Shopify branch ── */}
        {watchedType === 'shopify' && (
          <>
            <FormField
              control={form.control}
              name="storeIdentifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store domain</FormLabel>
                  <FormControl>
                    <Input placeholder="yourstore.myshopify.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Info banner */}
            <div className="flex items-start gap-2 rounded-[0.625rem] border border-border bg-muted/50 p-3 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                Shopify connections must be authorized via OAuth. Use the button below to connect — the
                connection row will be created automatically after authorization.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                const shop = form.getValues('storeIdentifier').trim().toLowerCase()
                if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
                  form.setError('storeIdentifier', {
                    message: 'Enter a valid *.myshopify.com domain first',
                  })
                  return
                }
                window.location.href =
                  `/api/connections/shopify/install?shop=${encodeURIComponent(shop)}`
              }}
            >
              Connect via OAuth
            </Button>
          </>
        )}

        {/* ── BigCommerce branch ── */}
        {watchedType === 'bigcommerce' && (
          <>
            <FormField
              control={form.control}
              name="storeIdentifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store hash</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. abc123" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* credentials.accessToken */}
            <FormField
              control={form.control}
              name="credentials.accessToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access token (X-Auth-Token)</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* credentials.clientId */}
            <FormField
              control={form.control}
              name="credentials.clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Your app client ID" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* credentials.clientSecret */}
            <FormField
              control={form.control}
              name="credentials.clientSecret"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client secret (optional)</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <SheetFooter className="px-0 pb-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending || watchedType === 'shopify'}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create connection
          </Button>
        </SheetFooter>
      </form>
    </Form>
  )
}

// ─── Edit Form ────────────────────────────────────────────────────────────────

function EditForm({
  connection,
  onSaved,
  onOpenChange,
}: {
  connection: SafeConnection
  onSaved: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = useTransition()
  const [testPending, startTestTransition] = useTransition()

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: connection.name,
      status: connection.status as 'active' | 'disabled' | 'error',
      credentials: {
        accessToken: '',
        clientId: '',
        clientSecret: '',
      },
    },
  })

  useEffect(() => {
    form.reset({
      name: connection.name,
      status: connection.status as 'active' | 'disabled' | 'error',
      credentials: { accessToken: '', clientId: '', clientSecret: '' },
    })
  }, [connection]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values: EditValues) {
    startTransition(async () => {
      // Only include credentials in PATCH if any credential field is filled
      const creds = values.credentials
      const hasCredChange =
        connection.type === 'bigcommerce' &&
        creds &&
        (creds.accessToken || creds.clientId || creds.clientSecret)

      const body: Record<string, unknown> = {
        name: values.name,
        status: values.status,
      }
      if (hasCredChange) {
        body.credentials = {
          storeHash: connection.storeIdentifier,
          accessToken: creds!.accessToken,
          clientId: creds!.clientId,
          clientSecret: creds!.clientSecret || undefined,
        }
      }

      const res = await fetch(`/api/connections/${connection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await safeJson(res)) as { data?: { ok?: boolean; error?: string }; error?: { message?: string; code?: string } }
      if (!res.ok) {
        if (res.status === 422 && json.error?.message) {
          toast.error(json.error.message)
          return
        }
        toast.error(json.error?.message ?? 'Failed to save')
        return
      }
      toast.success('Connection updated')
      onSaved()
      onOpenChange(false)
    })
  }

  function handleTest() {
    startTestTransition(async () => {
      const res = await fetch(`/api/connections/${connection.id}/test`, { method: 'POST' })
      const json = (await safeJson(res)) as { data?: { ok?: boolean; error?: string }; error?: { message?: string; code?: string } }
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Test failed')
        return
      }
      if (json.data?.ok) {
        toast.success('Connection is healthy')
      } else {
        toast.error(`Connection error: ${json.data?.error ?? 'Unknown error'}`)
      }
      onSaved()
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Read-only type + store identifier */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Platform</span>
            <div className="h-8 flex items-center rounded-md border border-input bg-muted/40 px-2.5 text-sm text-muted-foreground capitalize">
              {connection.type}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Store identifier</span>
            <div className="h-8 flex items-center rounded-md border border-input bg-muted/40 px-2.5 font-mono text-xs text-muted-foreground">
              {connection.storeIdentifier}
            </div>
          </div>
        </div>

        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Status */}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── BigCommerce credential rotation ── */}
        {connection.type === 'bigcommerce' && (
          <div className="flex flex-col gap-3 rounded-[0.625rem] border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Rotate credentials (optional)
            </p>
            <p className="text-xs text-muted-foreground">
              Fill all credential fields to rotate. Leave blank to keep existing credentials.
            </p>

            <FormField
              control={form.control}
              name="credentials.accessToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New access token</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="credentials.clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New client ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Client ID" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="credentials.clientSecret"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New client secret (optional)</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* ── Shopify reconnect ── */}
        {connection.type === 'shopify' && (
          <div className="flex flex-col gap-2 rounded-[0.625rem] border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Credentials
            </p>
            <p className="text-xs text-muted-foreground">
              Shopify credentials are managed via OAuth. Use the button below to reconnect or rotate
              your access token.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href =
                  `/api/connections/shopify/install?shop=${encodeURIComponent(connection.storeIdentifier)}`
              }}
            >
              Reconnect via OAuth
            </Button>
          </div>
        )}

        {/* Test connection button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={testPending || pending}
        >
          {testPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Zap className="mr-2 h-4 w-4" />
          )}
          Test connection
        </Button>

        <SheetFooter className="px-0 pb-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </SheetFooter>
      </form>
    </Form>
  )
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

export function ConnectionsSheet({
  open,
  onOpenChange,
  onSaved,
  mode,
  connection,
  initialType,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {mode === 'create' ? 'New connection' : `Edit — ${connection?.name ?? ''}`}
          </SheetTitle>
          <SheetDescription>
            {mode === 'create'
              ? 'Connect a commerce platform to enable syncing.'
              : 'Update connection settings or rotate credentials.'}
          </SheetDescription>
        </SheetHeader>

        <div className="p-4 flex flex-col gap-4">
          {mode === 'create' ? (
            <CreateForm
              onSaved={onSaved}
              onOpenChange={onOpenChange}
              initialType={initialType}
            />
          ) : connection ? (
            <EditForm
              connection={connection}
              onSaved={onSaved}
              onOpenChange={onOpenChange}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
