'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, type FieldPath, type Resolver } from 'react-hook-form'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { zodResolver as zodResolverRaw } from '@hookform/resolvers/zod'
// `zodResolver(setupSchema)`'s inferred type, combined with the schema's
// nested arrays + preprocess chain, exhausts the TS heap. Cast to a loose
// signature so the resolver is opaque to the type system; runtime is unaffected.
const zodResolver = zodResolverRaw as unknown as (s: unknown) => Resolver<SetupFormValues>
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { OnboardingModule } from '@/lib/onboarding/modules'
import { Stepper, type Step } from './Stepper'
import { ScopeUploader, type ScopeDocumentDraft } from './ScopeUploader'
import { SowGeneratePanel } from './SowGeneratePanel'
import { setupSchema, type SetupFormValues } from '../schema'
import { inferBrandingFromWebsite, saveSetup } from '../actions'

const STEPS: ReadonlyArray<Step> = [
  { key: 'type',     label: 'Dashboard Type' },
  { key: 'client',   label: 'Client Info & Config' },
  { key: 'scope',    label: 'Scope & Planning' },
  { key: 'modules',  label: 'Modules' },
  { key: 'review',   label: 'Review' },
]

// Loosened to string[] on purpose: the full FieldPath<SetupFormValues> type
// — combined with Zod array-of-object inference — explodes the TS type
// checker. We cast at the trigger() call site instead.
const STEP_FIELDS: ReadonlyArray<ReadonlyArray<string>> = [
  ['dashboardType'],
  ['name', 'slug', 'industry', 'country', 'timezone',
    'brandPrimaryColor', 'brandSecondaryColor', 'brandFontFamily', 'brandLogoUrl', 'brandFaviconUrl', 'sidebarTheme',
    'integrations'],
  ['planningNotes', 'scopeDocumentIds'],
  ['enabledModules', 'notes'],
  [],
]

const INDUSTRIES = ['Retail & E-commerce', 'SaaS & Software', 'Healthcare', 'Financial Services', 'Education', 'Manufacturing', 'Media & Entertainment', 'Non-profit', 'Other']
const COUNTRIES  = ['United States', 'United Kingdom', 'Canada', 'Australia', 'India', 'Germany', 'France', 'Spain', 'Netherlands', 'Singapore', 'Other']
const TIMEZONES  = ['Etc/UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney']

const SIDEBAR_THEME_OPTIONS: ReadonlyArray<{ key: SetupFormValues['sidebarTheme']; label: string; tagline: string; bg: string; accent: string; border: string }> = [
  { key: 'light',   label: 'Light',   tagline: 'White sidebar, soft borders.',   bg: '#FFFFFF', accent: '#F3F4F6', border: '#E5E7EB' },
  { key: 'navy',    label: 'Navy',    tagline: 'Stripe-style deep navy.',         bg: '#0F1B2D', accent: '#1B2A44', border: '#22324E' },
  { key: 'zoho',    label: 'Zoho',    tagline: 'Gunmetal blue.',                  bg: '#1F2839', accent: '#2A3447', border: '#323E54' },
  { key: 'slate',   label: 'Slate',   tagline: 'Linear / Vercel slate.',          bg: '#0F172A', accent: '#1E293B', border: '#334155' },
  { key: 'neutral', label: 'Neutral', tagline: 'GitHub / Notion neutral black.', bg: '#171717', accent: '#262626', border: '#404040' },
]

const DASHBOARD_TYPE_CARDS: ReadonlyArray<{ value: SetupFormValues['dashboardType']; title: string; description: string; badge?: string; disabled?: boolean }> = [
  { value: 'standalone', title: 'Standalone',  description: 'Just the dashboard — users, roles, logs, settings. No external integrations.' },
  { value: 'custom',     title: 'Custom',      description: 'Connect a Shopify or BigCommerce store. Sync products, orders, customers.', badge: 'Shopify · BigCommerce' },
  { value: 'middleware', title: 'Middleware',  description: 'Shopify or BigCommerce + an ERP system. ERP support is rolling out next.', badge: 'Shopify · BigCommerce + ERP' },
  { value: 'saas',       title: 'SaaS',        description: 'Multi-tenant hosted dashboard. Not yet available.', badge: 'Coming soon', disabled: true },
]

interface SetupWizardProps {
  defaultValues:    SetupFormValues
  modules:          ReadonlyArray<OnboardingModule>
  initialDocs:      ReadonlyArray<ScopeDocumentDraft>
  isReentry:        boolean
  canEdit:          boolean
}

export function SetupWizard({ defaultValues, modules, initialDocs, isReentry, canEdit }: SetupWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [visited, setVisited] = useState<Set<number>>(new Set([0]))
  const [pending, startTransition] = useTransition()
  const [brandPending, startBrandTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [docs, setDocs] = useState<ScopeDocumentDraft[]>([...initialDocs])
  const [brandWebsiteUrl, setBrandWebsiteUrl] = useState('')

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      ...defaultValues,
      scopeDocumentIds: initialDocs.map((d) => d.id),
    },
    mode: 'onBlur',
  })

  const { register, control, handleSubmit, watch, setValue, trigger, formState: { errors } } = form

  const dashboardType     = watch('dashboardType')
  const integrationsValue = watch('integrations')
  const enabledModules    = watch('enabledModules')

  // Auto-fill slug from name on first edit
  const [slugEdited, setSlugEdited] = useState(isReentry)
  const watchedName = watch('name')
  useMemo(() => {
    if (slugEdited) return
    const derived = (watchedName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    if (derived && form.getValues('slug') !== derived) {
      setValue('slug', derived, { shouldValidate: false, shouldDirty: false })
    }
  }, [watchedName, slugEdited, form, setValue])

  const showsIntegrations = dashboardType === 'custom' || dashboardType === 'middleware'

  async function goNext() {
    const fields = STEP_FIELDS[currentStep] as ReadonlyArray<FieldPath<SetupFormValues>>
    const ok = fields.length === 0 ? true : await trigger(fields)
    if (!ok) return
    const next = Math.min(currentStep + 1, STEPS.length - 1)
    setCurrentStep(next)
    setVisited((s) => new Set(s).add(next))
  }

  function goBack() {
    setCurrentStep(Math.max(currentStep - 1, 0))
  }

  function onSubmit(values: SetupFormValues) {
    setServerError(null)
    startTransition(async () => {
      const result = await saveSetup({ ...values, scopeDocumentIds: docs.map((d) => d.id) })
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [path, message] of Object.entries(result.fieldErrors)) {
            form.setError(path as FieldPath<SetupFormValues>, { message })
          }
        }
        if (result.friendlyError) setServerError(result.friendlyError)
        toast.error(result.friendlyError ?? 'Some fields need attention.')
        return
      }
      setSavedAt(new Date())
      toast.success(isReentry ? 'Dashboard setup updated.' : 'Dashboard setup complete!')
      router.refresh()
    })
  }

  function autofillBrandingFromWebsite() {
    const sourceUrl = brandWebsiteUrl.trim()
    if (!sourceUrl) {
      toast.error('Enter a website URL first.')
      return
    }

    startBrandTransition(async () => {
      const result = await inferBrandingFromWebsite(sourceUrl)
      if (!result.ok || !result.data) {
        toast.error(result.error ?? 'Could not infer branding from that website.')
        return
      }

      const updates: string[] = []
      if (result.data.primaryColor) {
        setValue('brandPrimaryColor', result.data.primaryColor, { shouldDirty: true, shouldValidate: true })
        updates.push('primary color')
      }
      if (result.data.secondaryColor) {
        setValue('brandSecondaryColor', result.data.secondaryColor, { shouldDirty: true, shouldValidate: true })
        updates.push('secondary color')
      }
      if (result.data.fontFamily) {
        setValue('brandFontFamily', result.data.fontFamily, { shouldDirty: true, shouldValidate: true })
        updates.push('font')
      }
      if (result.data.logoUrl) {
        setValue('brandLogoUrl', result.data.logoUrl, { shouldDirty: true, shouldValidate: true })
        updates.push('logo')
      }
      if (result.data.faviconUrl) {
        setValue('brandFaviconUrl', result.data.faviconUrl, { shouldDirty: true, shouldValidate: true })
        updates.push('favicon')
      }

      toast.success(`Autofilled ${updates.join(', ')}.`)
    })
  }

  const moduleErr       = (errors.enabledModules?.message ?? errors.enabledModules?.root?.message) as string | undefined
  const integrationsErr = (errors.integrations?.message ?? errors.integrations?.root?.message) as string | undefined

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <Stepper steps={STEPS} current={currentStep} visited={visited} onSelect={(i) => setCurrentStep(i)} />

      <Card className="rounded-[0.625rem] p-6">
        {/* ─── Step 1: Dashboard Type ─── */}
        {currentStep === 0 ? (
          <StepShell title="What kind of dashboard is this?" subtitle="Pick the option that matches the client's setup. You can change this later.">
            <Controller
              name="dashboardType"
              control={control}
              render={({ field }) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  {DASHBOARD_TYPE_CARDS.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      disabled={opt.disabled}
                      onClick={() => !opt.disabled && field.onChange(opt.value)}
                      aria-pressed={field.value === opt.value}
                      className={cn(
                        'flex flex-col items-start gap-2 rounded-md border p-4 text-left transition-colors',
                        opt.disabled && 'cursor-not-allowed opacity-60',
                        !opt.disabled && field.value === opt.value && 'border-primary ring-2 ring-primary/30',
                        !opt.disabled && field.value !== opt.value && 'border-border hover:border-foreground/40',
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{opt.title}</span>
                        {opt.badge ? (
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap',
                            opt.disabled ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
                          )}>{opt.badge}</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </button>
                  ))}
                </div>
              )}
            />
            {errors.dashboardType?.message ? <p className="mt-2 text-xs text-destructive">{errors.dashboardType.message}</p> : null}
          </StepShell>
        ) : null}

        {/* ─── Step 2: Client Info & Configuration ─── */}
        {currentStep === 1 ? (
          <StepShell title="Tell us about the client" subtitle="Business details, branding, and integrations.">
            <Section title="Client information">
              <Field label="Client name" error={errors.name?.message} required>
                <Input placeholder="Acme Corp" {...register('name')} />
              </Field>
              <Field label="Slug" error={errors.slug?.message} hint="Lowercase letters, numbers, and hyphens." required>
                <Input
                  className="font-mono"
                  placeholder="acme-corp"
                  {...register('slug', { onChange: () => setSlugEdited(true) })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Industry" error={errors.industry?.message}>
                  <Controller
                    name="industry"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="Country" error={errors.country?.message}>
                  <Controller
                    name="country"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>
              <Field label="Timezone" error={errors.timezone?.message} required>
                <Controller
                  name="timezone"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </Section>

            <Section title="Branding">
              <div className="rounded-md border border-border bg-muted/30 p-4">
                <Field label="Autofill from website" hint="Reads the site's theme color, CSS colors, and Google Font, then downloads logo and favicon into public assets.">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="url"
                      value={brandWebsiteUrl}
                      onChange={(e) => setBrandWebsiteUrl(e.target.value)}
                      placeholder="https://acme.com"
                      className="sm:flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={autofillBrandingFromWebsite}
                      disabled={brandPending || pending || !canEdit}
                      className="sm:w-auto"
                    >
                      {brandPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Autofill
                    </Button>
                  </div>
                </Field>
              </div>
              <Field label="Primary brand color" error={errors.brandPrimaryColor?.message} required>
                <Controller
                  name="brandPrimaryColor"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center gap-3">
                      <input type="color" value={field.value} onChange={field.onChange} className="h-9 w-12 cursor-pointer rounded border border-input" />
                      <Input value={field.value} onChange={field.onChange} className="w-32 font-mono" />
                    </div>
                  )}
                />
              </Field>
              <Field label="Secondary brand color" hint="Optional, used for accents." error={errors.brandSecondaryColor?.message}>
                <Controller
                  name="brandSecondaryColor"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center gap-3">
                      <input type="color" value={field.value || '#94a3b8'} onChange={field.onChange} className="h-9 w-12 cursor-pointer rounded border border-input" />
                      <Input value={field.value ?? ''} onChange={field.onChange} placeholder="#94a3b8" className="w-32 font-mono" />
                    </div>
                  )}
                />
              </Field>
              <Field label="Brand font" hint="Google Font name (e.g. 'Inter')." error={errors.brandFontFamily?.message}>
                <Input placeholder="Inter" {...register('brandFontFamily')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Logo asset" error={errors.brandLogoUrl?.message}>
                  <Input placeholder="/brand-assets/logo.svg" {...register('brandLogoUrl')} />
                </Field>
                <Field label="Favicon asset" error={errors.brandFaviconUrl?.message}>
                  <Input placeholder="/brand-assets/favicon.ico" {...register('brandFaviconUrl')} />
                </Field>
              </div>
              <Field label="Sidebar theme" error={errors.sidebarTheme?.message} required>
                <Controller
                  name="sidebarTheme"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {SIDEBAR_THEME_OPTIONS.map((opt) => (
                        <button
                          type="button"
                          key={opt.key}
                          onClick={() => field.onChange(opt.key)}
                          aria-pressed={field.value === opt.key}
                          className={cn(
                            'flex flex-col gap-2 rounded-md border p-2 text-left transition-colors',
                            field.value === opt.key ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-foreground/40',
                          )}
                        >
                          <div className="h-16 w-full rounded relative overflow-hidden" style={{ backgroundColor: opt.bg }}>
                            <span className="absolute left-2 right-2 top-2 h-1.5 rounded" style={{ backgroundColor: opt.accent }} />
                            <span className="absolute left-2 right-4 top-5 h-1 rounded" style={{ backgroundColor: opt.border }} />
                            <span className="absolute left-2 right-6 top-7 h-1 rounded" style={{ backgroundColor: opt.border }} />
                          </div>
                          <div>
                            <div className="text-xs font-medium">{opt.label}</div>
                            <div className="text-[10px] text-muted-foreground leading-tight">{opt.tagline}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                />
              </Field>
            </Section>

            {showsIntegrations ? (
              <Section title="Integrations">
                <p className="text-xs text-muted-foreground -mt-2">
                  Toggle the platforms this dashboard will sync from. You can connect stores here or later from the Connections module.
                </p>

                <PlatformToggle
                  title="Shopify"
                  description="Sync products, orders, and customers from a Shopify store."
                  enabled={integrationsValue.shopify.enabled}
                  onToggle={(v) => setValue('integrations.shopify.enabled', v, { shouldValidate: true })}
                >
                  <Field label="Store domain" hint="Optional — set later from Connections." error={(errors.integrations?.shopify?.storeUrl as { message?: string })?.message}>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input placeholder="acme.myshopify.com" {...register('integrations.shopify.storeUrl')} />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const shop = form.getValues('integrations.shopify.storeUrl')?.trim().toLowerCase()
                          if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop ?? '')) {
                            form.setError('integrations.shopify.storeUrl', { message: 'Enter a valid *.myshopify.com domain first.' })
                            return
                          }
                          window.location.href =
                            `/api/connections/shopify/install?shop=${encodeURIComponent(shop!)}&returnTo=${encodeURIComponent('/settings/dashboard-setup')}`
                        }}
                        disabled={pending || !canEdit}
                        className="sm:w-auto"
                      >
                        Connect Shopify
                      </Button>
                    </div>
                  </Field>
                  <SyncToggles platform="shopify" register={register} watch={watch} />
                </PlatformToggle>

                <PlatformToggle
                  title="BigCommerce"
                  description="Sync products, orders, and customers from a BigCommerce store."
                  enabled={integrationsValue.bigcommerce.enabled}
                  onToggle={(v) => setValue('integrations.bigcommerce.enabled', v, { shouldValidate: true })}
                >
                  <Field label="Store hash" hint="6–16 alphanumeric characters." error={(errors.integrations?.bigcommerce?.storeHash as { message?: string })?.message}>
                    <Input placeholder="abc123" {...register('integrations.bigcommerce.storeHash')} />
                  </Field>
                  <div className="rounded-md border border-border bg-muted/30 p-4">
                    <div className="mb-3">
                      <div className="text-sm font-semibold">BigCommerce connection</div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Optional during setup. If filled, this creates or updates the BigCommerce connection when you save.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      <Field label="Connection name" error={errors.integrations?.bigcommerce?.connection?.name?.message}>
                        <Input placeholder="Acme BigCommerce" {...register('integrations.bigcommerce.connection.name')} />
                      </Field>
                      <Field label="Access token" error={errors.integrations?.bigcommerce?.connection?.accessToken?.message}>
                        <Input type="password" placeholder="X-Auth-Token" {...register('integrations.bigcommerce.connection.accessToken')} />
                      </Field>
                      <Field label="Client ID" error={errors.integrations?.bigcommerce?.connection?.clientId?.message}>
                        <Input placeholder="BigCommerce app client ID" {...register('integrations.bigcommerce.connection.clientId')} />
                      </Field>
                      <Field label="Client secret" hint="Optional." error={errors.integrations?.bigcommerce?.connection?.clientSecret?.message}>
                        <Input type="password" placeholder="Optional client secret" {...register('integrations.bigcommerce.connection.clientSecret')} />
                      </Field>
                    </div>
                  </div>
                  <SyncToggles platform="bigcommerce" register={register} watch={watch} />
                </PlatformToggle>

                {dashboardType === 'middleware' ? (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">ERP system</div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Connect to an ERP like NetSuite, SAP, or Odoo. Available in a future release.
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] whitespace-nowrap text-muted-foreground">Coming soon</span>
                    </div>
                  </div>
                ) : null}

                {integrationsErr ? <p className="text-xs text-destructive">{integrationsErr}</p> : null}
              </Section>
            ) : null}
          </StepShell>
        ) : null}

        {/* ─── Step 3: Scope & Project Planning ─── */}
        {currentStep === 2 ? (
          <StepShell title="Scope & project planning" subtitle="Upload scope documents and add planning notes.">
            <Section title="Scope documents">
              <ScopeUploader
                docs={docs}
                onChange={setDocs}
                disabled={!canEdit || pending}
              />
            </Section>

            <Section title="Project planning">
              <Field label="Planning notes" error={errors.planningNotes?.message}>
                <Textarea rows={3} placeholder="Anything else relevant to the project plan." {...register('planningNotes')} />
              </Field>
            </Section>
          </StepShell>
        ) : null}

        {/* ─── Step 4: Modules ─── */}
        {currentStep === 3 ? (
          <StepShell title="Pick the modules" subtitle="Choose which modules appear in the sidebar. Required modules can't be turned off.">
            <Section title="Default modules">
              <Controller
                name="enabledModules"
                control={control}
                render={({ field }) => (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {modules
                      .filter((m) => !m.middlewareOnly || dashboardType === 'middleware' || dashboardType === 'custom')
                      .map((m) => {
                        const checked = field.value.includes(m.key)
                        const isRequired = m.required === true
                        return (
                          <label
                            key={m.key}
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
                              checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                              isRequired && 'opacity-90',
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={isRequired}
                              onCheckedChange={(v) => {
                                const next = new Set(field.value)
                                if (v) next.add(m.key)
                                else next.delete(m.key)
                                field.onChange(Array.from(next))
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">
                                {m.displayName}
                                {isRequired ? <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">required</span> : null}
                              </div>
                              <div className="text-xs text-muted-foreground">{m.description}</div>
                            </div>
                          </label>
                        )
                      })}
                  </div>
                )}
              />
              {moduleErr ? <p className="text-xs text-destructive">{moduleErr}</p> : null}
            </Section>

            <Section title="Custom modules from your SOW">
              <SowGeneratePanel docs={docs} disabled={!canEdit || pending} />
            </Section>

            <Field label="Internal notes" error={errors.notes?.message}>
              <Textarea rows={3} placeholder="Visible to staff only." {...register('notes')} />
            </Field>
          </StepShell>
        ) : null}

        {/* ─── Step 5: Review ─── */}
        {currentStep === 4 ? (
          <StepShell title="Does this look right?" subtitle="Review the details, then save to apply.">
            <ReviewSummary
              values={watch()}
              modules={modules}
              enabledModuleKeys={enabledModules}
              docs={docs}
            />
            {serverError ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{serverError}</p>
              </div>
            ) : null}
            {savedAt ? (
              <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Saved at {savedAt.toLocaleTimeString()}. Sidebar and branding refreshed.</p>
              </div>
            ) : null}
          </StepShell>
        ) : null}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={goBack} disabled={currentStep === 0 || pending}>
          Back
        </Button>
        {currentStep < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext} disabled={pending}>
            Next
          </Button>
        ) : (
          <Button type="submit" disabled={pending || !canEdit}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReentry ? 'Save changes' : 'Save & finish setup'}
          </Button>
        )}
      </div>
    </form>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StepShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-1.5">
        {title}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}

function Field({
  label, hint, error, required, children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="flex items-center gap-1 text-sm">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function PlatformToggle({
  title, description, enabled, onToggle, children,
}: {
  title: string
  description: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-md border', enabled ? 'border-primary/40' : 'border-border')}>
      <label className="flex cursor-pointer items-start gap-3 p-4">
        <Checkbox checked={enabled} onCheckedChange={(v) => onToggle(Boolean(v))} className="mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </label>
      {enabled ? <div className="flex flex-col gap-3 border-t border-border p-4">{children}</div> : null}
    </div>
  )
}

function SyncToggles({
  platform, register, watch,
}: {
  platform: 'shopify' | 'bigcommerce'
  register: ReturnType<typeof useForm<SetupFormValues>>['register']
  watch: ReturnType<typeof useForm<SetupFormValues>>['watch']
}) {
  const targets: ReadonlyArray<{ key: 'products' | 'orders' | 'customers'; label: string }> = [
    { key: 'products',  label: 'Products'  },
    { key: 'orders',    label: 'Orders'    },
    { key: 'customers', label: 'Customers' },
  ]
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm">Initial sync</Label>
      <div className="flex flex-wrap gap-2">
        {targets.map((t) => {
          const path = `integrations.${platform}.sync.${t.key}` as const
          const checked = !!watch(path)
          return (
            <label
              key={t.key}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                checked ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/40',
              )}
            >
              <input type="checkbox" {...register(path)} className="h-4 w-4" />
              {t.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}


// ─── Review ─────────────────────────────────────────────────────────────────

function ReviewSummary({
  values, modules, enabledModuleKeys, docs,
}: {
  values: SetupFormValues
  modules: ReadonlyArray<OnboardingModule>
  enabledModuleKeys: ReadonlyArray<string>
  docs: ReadonlyArray<ScopeDocumentDraft>
}) {
  const enabledSet = new Set(enabledModuleKeys)
  const selectedModules = modules.filter((m) => enabledSet.has(m.key))
  const integrationsLabel = (() => {
    if (values.dashboardType === 'standalone') return '—'
    if (values.dashboardType === 'saas') return 'SaaS (coming soon)'
    const platforms = [
      values.integrations.shopify.enabled ? 'Shopify' : null,
      values.integrations.bigcommerce.enabled ? 'BigCommerce' : null,
    ].filter(Boolean).join(', ') || 'none'
    if (values.dashboardType === 'middleware') return `${platforms} + ERP (coming soon)`
    return platforms
  })()

  const rows: Array<[string, React.ReactNode]> = [
    ['Dashboard type',  capitalize(values.dashboardType)],
    ['Integrations',    integrationsLabel],
    ['Client name',     values.name || '—'],
    ['Slug',            values.slug || '—'],
    ['Industry',        values.industry || '—'],
    ['Country',         values.country || '—'],
    ['Timezone',        values.timezone],
    ['Brand colors',    <span key="bc" className="flex items-center gap-2">
                          <span className="inline-block h-4 w-4 rounded border border-border" style={{ backgroundColor: values.brandPrimaryColor }} />
                          <code className="font-mono text-xs">{values.brandPrimaryColor}</code>
                          {values.brandSecondaryColor ? (
                            <>
                              <span className="inline-block h-4 w-4 rounded border border-border" style={{ backgroundColor: values.brandSecondaryColor }} />
                              <code className="font-mono text-xs">{values.brandSecondaryColor}</code>
                            </>
                          ) : null}
                        </span>],
    ['Font',            values.brandFontFamily || '—'],
    ['Sidebar theme',   values.sidebarTheme],
    ['Scope documents', docs.length === 0 ? '—' : `${docs.length} (${docs.map((d) => d.filename).join(', ')})`],
    ['Modules',         selectedModules.length === 0 ? '—' : selectedModules.map((m) => m.displayName).join(', ')],
    ['Notes',           values.notes || '—'],
  ]

  return (
    <dl className="divide-y divide-border rounded-md border border-border bg-muted/40">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start gap-4 px-4 py-3 text-sm">
          <dt className="w-32 shrink-0 font-medium text-muted-foreground">{label}</dt>
          <dd className="min-w-0 flex-1 break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function capitalize(s: string): string {
  if (!s) return s
  return s[0]!.toUpperCase() + s.slice(1)
}
