import { sqliteTable, integer, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * Synced records from commerce platforms (Shopify, BigCommerce).
 *
 * One row per (platform, externalId) — upserted on every sync run so the
 * local copy mirrors the platform. Raw platform payload is kept in `raw`
 * (JSON string) so the UI can surface fields we don't model explicitly
 * without a schema change every time a use case appears.
 *
 * `syncedAt` is bumped on every upsert, so "records synced in the last
 * run" is just a filter on the latest `sync_runs.finishedAt`.
 */

export const integrationProducts = sqliteTable(
  'integration_products',
  {
    id:          integer('id').primaryKey({ autoIncrement: true }),
    // Platform is denormalized (derivable via connections join) but kept for
    // fast "all Shopify" queries without a join.
    platform:    text('platform').notNull(), // 'shopify' | 'bigcommerce'
    // Which store this row came from. No FK: audit rows survive connection deletion
    // (matches the `sync_runs.connectionId` pattern). Required going forward.
    connectionId: integer('connection_id').notNull(),
    externalId:  text('external_id').notNull(),
    title:       text('title'),
    sku:         text('sku'),
    price:       text('price'),        // stored as text to preserve decimals
    currency:    text('currency'),
    status:      text('status'),
    raw:         text('raw'),          // JSON blob from the platform
    syncedAt:    text('synced_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    uniq:         uniqueIndex('integration_products_connection_external_uq').on(t.connectionId, t.externalId),
    platformIdx:  index('integration_products_platform_idx').on(t.platform),
    connectionIdx: index('integration_products_connection_idx').on(t.connectionId),
  }),
)

export const integrationOrders = sqliteTable(
  'integration_orders',
  {
    id:           integer('id').primaryKey({ autoIncrement: true }),
    platform:     text('platform').notNull(),
    connectionId: integer('connection_id').notNull(),
    externalId:   text('external_id').notNull(),
    orderNumber:  text('order_number'),
    customerEmail: text('customer_email'),
    totalPrice:   text('total_price'),
    currency:     text('currency'),
    status:       text('status'),       // platform financial/fulfilment status
    placedAt:     text('placed_at'),    // ISO 8601
    raw:          text('raw'),
    syncedAt:     text('synced_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    uniq:         uniqueIndex('integration_orders_connection_external_uq').on(t.connectionId, t.externalId),
    platformIdx:  index('integration_orders_platform_idx').on(t.platform),
    connectionIdx: index('integration_orders_connection_idx').on(t.connectionId),
    placedAtIdx:  index('integration_orders_placed_at_idx').on(t.placedAt),
  }),
)

export const integrationCustomers = sqliteTable(
  'integration_customers',
  {
    id:          integer('id').primaryKey({ autoIncrement: true }),
    platform:    text('platform').notNull(),
    connectionId: integer('connection_id').notNull(),
    externalId:  text('external_id').notNull(),
    email:       text('email'),
    firstName:   text('first_name'),
    lastName:    text('last_name'),
    ordersCount: integer('orders_count'),
    totalSpent:  text('total_spent'),
    raw:         text('raw'),
    syncedAt:    text('synced_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    uniq:          uniqueIndex('integration_customers_connection_external_uq').on(t.connectionId, t.externalId),
    platformIdx:   index('integration_customers_platform_idx').on(t.platform),
    connectionIdx: index('integration_customers_connection_idx').on(t.connectionId),
  }),
)

/**
 * Audit trail of every sync attempt. Rows are NEVER deleted — the status
 * page reads the latest row per (platform, target) to show last-run info.
 */
export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id:          integer('id').primaryKey({ autoIncrement: true }),
    connectionId: integer('connection_id'),       // FK integration_connections.id (nullable for legacy rows)
    platform:    text('platform').notNull(),
    target:      text('target').notNull(),        // 'products' | 'orders' | 'customers'
    status:      text('status').notNull(),        // 'running' | 'ok' | 'failed'
    recordsSeen: integer('records_seen').notNull().default(0),
    recordsUpserted: integer('records_upserted').notNull().default(0),
    error:       text('error'),
    triggeredBy: integer('triggered_by'),         // users.id (no FK to keep this table append-only)
    startedAt:   text('started_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    finishedAt:  text('finished_at'),
  },
  (t) => ({
    platformIdx:     index('sync_runs_platform_idx').on(t.platform),
    targetIdx:       index('sync_runs_target_idx').on(t.platform, t.target),
    finishedAtIdx:   index('sync_runs_finished_at_idx').on(t.finishedAt),
    connectionIdIdx: index('sync_runs_connection_id_idx').on(t.connectionId),
  }),
)

export type IntegrationProduct    = typeof integrationProducts.$inferSelect
export type NewIntegrationProduct = typeof integrationProducts.$inferInsert
export type IntegrationOrder      = typeof integrationOrders.$inferSelect
export type NewIntegrationOrder   = typeof integrationOrders.$inferInsert
export type IntegrationCustomer   = typeof integrationCustomers.$inferSelect
export type NewIntegrationCustomer = typeof integrationCustomers.$inferInsert
export type SyncRun               = typeof syncRuns.$inferSelect
export type NewSyncRun            = typeof syncRuns.$inferInsert

export type IntegrationPlatform = 'shopify' | 'bigcommerce'
export type IntegrationTarget   = 'products' | 'orders' | 'customers'
