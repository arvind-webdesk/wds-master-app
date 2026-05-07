import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * Single-row project planning data captured during the setup wizard.
 *
 * Milestones and deliverables are JSON arrays (text-encoded for SQLite).
 *   milestones:    Array<{ id: string; name: string; dueDate: string | null; description: string | null }>
 *   deliverables:  Array<{ id: string; text: string }>
 *
 * Pinned to id=1 (mirrors client_config) — the wizard upserts this row.
 */
export const projectPlanning = sqliteTable('project_planning', {
  id:           integer('id').primaryKey({ autoIncrement: false }),
  startDate:    text('start_date'),
  milestones:   text('milestones').notNull().default('[]'),
  deliverables: text('deliverables').notNull().default('[]'),
  notes:        text('notes'),
  updatedAt:    text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
})

export type ProjectPlanningRow    = typeof projectPlanning.$inferSelect
export type NewProjectPlanningRow = typeof projectPlanning.$inferInsert
