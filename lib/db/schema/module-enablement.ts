import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * Per-module on/off switch. One row per known module key.
 * Written by the setup wizard; read by the Sidebar (and any feature
 * gate that needs to know whether a module is active).
 *
 * The canonical list of module keys lives in lib/onboarding/modules.ts.
 * Rows for unknown keys are ignored on read.
 */
export const moduleEnablement = sqliteTable('module_enablement', {
  moduleKey: text('module_key').primaryKey(),
  enabled:   integer('enabled', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
})

export type ModuleEnablementRow    = typeof moduleEnablement.$inferSelect
export type NewModuleEnablementRow = typeof moduleEnablement.$inferInsert
