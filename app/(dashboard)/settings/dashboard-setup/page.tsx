import { redirect } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { getSessionUser } from '@/lib/auth/session'
import {
  getClientConfig,
  getEnabledModules,
  getProjectPlanning,
  getScopeDocuments,
} from '@/lib/client-config'
import { ONBOARDING_MODULES, REQUIRED_MODULE_KEYS } from '@/lib/onboarding/modules'
import { SetupWizard } from './_components/SetupWizard'
import type { SetupFormValues } from './schema'

export const metadata = { title: 'Dashboard Setup' }

export default async function DashboardSetupPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  // Locked to superadmins by user type — not by CASL — so a regular role
  // can't be granted access by editing role permissions.
  if (user.userType !== 'superadmin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 gap-3 text-center">
        <Settings2 className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Dashboard Setup is restricted to super admins.</p>
      </div>
    )
  }

  const [config, enabledSet, planning, scopeDocs] = await Promise.all([
    getClientConfig(),
    getEnabledModules(),
    getProjectPlanning(),
    getScopeDocuments(),
  ])

  const isReentry = config.completedAt != null
  const canEdit   = true  // gate is userType-only; reaching this line means superadmin

  // First-run defaults: opt in to non-middleware-only modules.
  const initialEnabled = isReentry
    ? Array.from(enabledSet)
    : ONBOARDING_MODULES.filter((m) => !m.middlewareOnly).map((m) => m.key)

  const defaultValues: SetupFormValues = {
    dashboardType:       config.dashboardType === 'saas' ? 'standalone' : config.dashboardType,
    name:                config.name === 'Your dashboard' ? '' : config.name,
    slug:                config.slug,
    industry:            config.industry ?? '',
    country:             config.country ?? '',
    timezone:            config.timezone,
    brandPrimaryColor:   config.brandPrimaryColor,
    brandSecondaryColor: config.brandSecondaryColor ?? '',
    brandFontFamily:     config.brandFontFamily ?? '',
    brandLogoUrl:        config.brandLogoUrl ?? '',
    brandFaviconUrl:     config.brandFaviconUrl ?? '',
    sidebarTheme:        config.sidebarTheme,
    integrations: {
      shopify: {
        enabled:  config.integrations.shopify.enabled,
        storeUrl: config.integrations.shopify.storeUrl ?? '',
        sync:     config.integrations.shopify.sync,
      },
      bigcommerce: {
        enabled:   config.integrations.bigcommerce.enabled,
        storeHash: config.integrations.bigcommerce.storeHash ?? '',
        connection: {
          name:         '',
          accessToken:  '',
          clientId:     '',
          clientSecret: '',
        },
        sync:      config.integrations.bigcommerce.sync,
      },
    },
    planningNotes:    planning.notes ?? '',
    scopeDocumentIds: scopeDocs.map((d) => d.id),
    enabledModules:   Array.from(new Set([...REQUIRED_MODULE_KEYS, ...initialEnabled])),
    notes:            config.notes ?? '',
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard Setup</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isReentry
            ? 'Update branding, modules, integrations, and project planning. Changes apply immediately.'
            : 'Welcome — let’s configure your dashboard for this client.'}
        </p>
      </div>

      {!canEdit ? (
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          You can view setup but not edit it. Contact a super admin to make changes.
        </div>
      ) : null}

      <SetupWizard
        defaultValues={defaultValues}
        modules={ONBOARDING_MODULES}
        initialDocs={scopeDocs}
        isReentry={isReentry}
        canEdit={canEdit}
      />
    </div>
  )
}
