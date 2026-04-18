import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const settings = sqliteTable(
  'settings',
  {
    id:        integer('id').primaryKey({ autoIncrement: true }),
    key:       text('key').notNull().unique(),
    value:     text('value'),
    createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
  },
  (table) => ({
    keyIdx: index('settings_key_idx').on(table.key),
  }),
)

export type Setting    = typeof settings.$inferSelect
export type NewSetting = typeof settings.$inferInsert
