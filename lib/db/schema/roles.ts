import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const roles = sqliteTable(
  'roles',
  {
    id:          integer('id').primaryKey({ autoIncrement: true }),
    name:        text('name').notNull().unique(),
    description: text('description'),
    createdAt:   text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt:   text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt:   text('deleted_at'),
  },
  (table) => ({
    nameIdx: index('roles_name_idx').on(table.name),
  }),
)

export type Role    = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
