import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * Per-platform integration toggle + sync targets.
 *
 * NOTE: secrets (access tokens, webhook secrets) live in `integration_connections.credentials`,
 * not here. This table only records "is this platform turned on for this dashboard"
 * plus the per-target sync flags. The wizard writes here; the connections module
 * writes credentials.
 */
export const integrationConfig = sqliteTable('integration_config', {
  platform:      text('platform').primaryKey(),  // 'shopify' | 'bigcommerce'
  enabled:       integer('enabled', { mode: 'boolean' }).notNull().default(false),
  storeUrl:      text('store_url'),              // shopify only: foo.myshopify.com
  storeHash:     text('store_hash'),             // bigcommerce only
  syncProducts:  integer('sync_products', { mode: 'boolean' }).notNull().default(true),
  syncOrders:    integer('sync_orders',   { mode: 'boolean' }).notNull().default(true),
  syncCustomers: integer('sync_customers', { mode: 'boolean' }).notNull().default(false),
  updatedAt:     text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
})

export type IntegrationConfigRow    = typeof integrationConfig.$inferSelect
export type NewIntegrationConfigRow = typeof integrationConfig.$inferInsert
