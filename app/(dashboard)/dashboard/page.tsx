'use client'

import { useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAbility } from '@/lib/acl/ability-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  getAvailableDashboardViews,
  getDefaultDashboardView,
  type DashboardView,
  type MiddlewarePlatform,
} from '@/lib/analytics/dashboard-view'
import { getPlatformMeta } from '@/lib/analytics/platform-meta'
import { CustomDashboard } from '@/components/analytics/custom-dashboard'
import { CommerceDashboard } from '@/components/analytics/commerce-dashboard'
import { useClientConfig } from '@/lib/client-config-context'

function viewLabel(view: DashboardView): string {
  if (view === 'custom') return 'System'
  return getPlatformMeta(view).label
}

export default function DashboardPage() {
  const ability = useAbility()
  const canRead = ability.can('read', 'Dashboard')
  const clientConfig = useClientConfig()

  const views = useMemo(() => getAvailableDashboardViews(clientConfig), [clientConfig])
  const [active, setActive] = useState<DashboardView>(() => getDefaultDashboardView(clientConfig))
  const showSwitcher = views.length > 1

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <Card className="rounded-[0.625rem] max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle className="text-base text-destructive">Access denied</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You do not have access to the dashboard. Contact an administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderView = (view: DashboardView) =>
    view === 'custom' ? <CustomDashboard /> : <CommerceDashboard platform={view as MiddlewarePlatform} />

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {showSwitcher
              ? 'Switch between your connected platforms.'
              : 'Overview of your dashboard data.'}
          </p>
        </div>
      </div>

      {showSwitcher ? (
        <Tabs value={active} onValueChange={(v) => setActive(v as DashboardView)}>
          <TabsList>
            {views.map((v) => (
              <TabsTrigger key={v} value={v}>
                {viewLabel(v)}
              </TabsTrigger>
            ))}
          </TabsList>
          {views.map((v) => (
            <TabsContent key={v} value={v} className="mt-4">
              {renderView(v)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        renderView(active)
      )}
    </div>
  )
}
