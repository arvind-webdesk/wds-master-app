import { pgTable, serial, varchar, text, timestamp, index, unique } from 'drizzle-orm/pg-core'

export const settings = pgTable(
  'settings',
  {
    id:        serial('id').primaryKey(),
    key:       varchar('key', { length: 100 }).notNull().unique(),
    value:     text('value'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    keyIdx: index('settings_key_idx').on(table.key),
  }),
)

export type Setting    = typeof settings.$inferSelect
export type NewSetting = typeof settings.$inferInsert
