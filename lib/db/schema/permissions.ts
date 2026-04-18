import { pgTable, serial, varchar, timestamp, index, unique } from 'drizzle-orm/pg-core'

export const permissions = pgTable(
  'permissions',
  {
    id:        serial('id').primaryKey(),
    name:      varchar('name', { length: 100 }).notNull(), // module name, e.g. "users"
    action:    varchar('action', { length: 20 }).notNull(), // 'view' | 'edit' | 'delete' | 'add'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    nameActionUnq: unique('permissions_name_action_unq').on(table.name, table.action),
    nameIdx:       index('permissions_name_idx').on(table.name),
  }),
)

export type Permission    = typeof permissions.$inferSelect
export type NewPermission = typeof permissions.$inferInsert
