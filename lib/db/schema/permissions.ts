import { sqliteTable, integer, text, index, unique } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const permissions = sqliteTable(
  'permissions',
  {
    id:        integer('id').primaryKey({ autoIncrement: true }),
    name:      text('name').notNull(),   // module name, e.g. "users"
    action:    text('action').notNull(), // 'view' | 'edit' | 'delete' | 'add'
    module:    text('module').notNull(),
    createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    nameActionUnq: unique('permissions_name_action_unq').on(table.name, table.action),
    nameIdx:       index('permissions_name_idx').on(table.name),
    moduleIdx:     index('permissions_module_idx').on(table.module),
  }),
)

export type Permission    = typeof permissions.$inferSelect
export type NewPermission = typeof permissions.$inferInsert
