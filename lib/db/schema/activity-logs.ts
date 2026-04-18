import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

export const activityLogs = sqliteTable(
  'activity_logs',
  {
    id:          integer('id').primaryKey({ autoIncrement: true }),
    userId:      integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    action:      text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId:   integer('subject_id'),
    meta:        text('meta'),
    ip:          text('ip'),
    userAgent:   text('user_agent'),
    createdAt:   text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt:   text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    userIdIdx:    index('activity_logs_user_id_idx').on(table.userId),
    actionIdx:    index('activity_logs_action_idx').on(table.action),
    subjectIdx:   index('activity_logs_subject_idx').on(table.subjectType, table.subjectId),
    createdAtIdx: index('activity_logs_created_at_idx').on(table.createdAt),
  }),
)

export type ActivityLog    = typeof activityLogs.$inferSelect
export type NewActivityLog = typeof activityLogs.$inferInsert
