import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

export const connections = sqliteTable(
  'integration_connections',
  {
    id:              integer('id').primaryKey({ autoIncrement: true }),
    name:            text('name').notNull(),
    type:            text('type').notNull(),                                    // 'shopify' | 'bigcommerce'
    status:          text('status').notNull().default('active'),                // 'active' | 'disabled' | 'error'
    storeIdentifier: text('store_identifier').notNull(),
    credentials:     text('credentials'),                                       // AES-GCM encrypted ciphertext, nullable
    lastSyncAt:      text('last_sync_at'),                                      // ISO 8601, nullable
    createdBy:       integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt:       text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt:       text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt:       text('deleted_at'),                                        // nullable, soft-delete
  },
  (t) => ({
    typeIdx:                  index('connections_type_idx').on(t.type),
    statusIdx:                index('connections_status_idx').on(t.status),
    storeIdentifierIdx:       index('connections_store_identifier_idx').on(t.storeIdentifier),
    deletedAtIdx:             index('connections_deleted_at_idx').on(t.deletedAt),
    typeStoreIdentifierUq:    uniqueIndex('connections_type_store_identifier_uq')
                                .on(t.type, t.storeIdentifier)
                                .where(sql`deleted_at IS NULL`),
  }),
)

export type Connection    = typeof connections.$inferSelect
export type NewConnection = typeof connections.$inferInsert

export type ConnectionType   = 'shopify' | 'bigcommerce'
export type ConnectionStatus = 'active' | 'disabled' | 'error'

/** Safe connection — excludes the encrypted credentials blob. Use this for all API responses. */
export type SafeConnection = Omit<Connection, 'credentials'> & { hasCredentials: boolean }
