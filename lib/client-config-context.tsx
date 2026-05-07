'use client'

import { createContext, useContext, useMemo } from 'react'
import type { ClientConfig } from '@/lib/client-config'

/**
 * Client-side mirror of the DB `client_config` row.
 *
 * The dashboard layout reads the config server-side via `getClientConfig()`,
 * then passes it into this provider so client components (Sidebar, sheets,
 * toolbars) can access dashboard-type / integration flags synchronously.
 */
const ClientConfigContext = createContext<ClientConfig | null>(null)

export function ClientConfigProvider({
  config,
  children,
}: {
  config: ClientConfig
  children: React.ReactNode
}) {
  return <ClientConfigContext.Provider value={config}>{children}</ClientConfigContext.Provider>
}

export function useClientConfig(): ClientConfig {
  const ctx = useContext(ClientConfigContext)
  if (!ctx) {
    throw new Error('useClientConfig must be used inside <ClientConfigProvider>')
  }
  return ctx
}

/** True when the dashboard supports integrations (middleware or custom) AND the platform is enabled. */
export function useIntegrationEnabled(platform: 'shopify' | 'bigcommerce'): boolean {
  const config = useClientConfig()
  const supportsIntegrations =
    config.dashboardType === 'middleware' || config.dashboardType === 'custom'
  return supportsIntegrations && config.integrations[platform].enabled
}

/** Convenience: both flags + a few derived values used across the connections UI. */
export function useIntegrationGate() {
  const config = useClientConfig()
  return useMemo(() => {
    const supportsIntegrations =
      config.dashboardType === 'middleware' || config.dashboardType === 'custom'
    const shopifyOn     = supportsIntegrations && config.integrations.shopify.enabled
    const bigcommerceOn = supportsIntegrations && config.integrations.bigcommerce.enabled
    return {
      shopifyOn,
      bigcommerceOn,
      bothEnabled:    shopifyOn && bigcommerceOn,
      onlyShopify:    shopifyOn && !bigcommerceOn,
      onlyBigCommerce: bigcommerceOn && !shopifyOn,
      anyEnabled:     shopifyOn || bigcommerceOn,
    }
  }, [config])
}
