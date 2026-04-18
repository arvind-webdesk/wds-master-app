import { pgTable, serial, varchar, text, timestamp, index } from 'drizzle-orm/pg-core'

export const roles = pgTable(
  'roles',
  {
    id:          serial('id').primaryKey(),
    name:        varchar('name', { length: 100 }).notNull().unique(),
    description: text('description'),
    createdAt:   timestamp('created_at').defaultNow().notNull(),
    updatedAt:   timestamp('updated_at').defaultNow().notNull(),
    deletedAt:   timestamp('deleted_at'),
  },
  (table) => ({
    nameIdx: index('roles_name_idx').on(table.name),
  }),
)

export type Role    = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
