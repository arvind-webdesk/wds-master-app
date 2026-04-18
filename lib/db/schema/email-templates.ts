import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const emailTemplates = sqliteTable(
  'email_templates',
  {
    id:        integer('id').primaryKey({ autoIncrement: true }),
    title:     text('title').notNull(),
    code:      text('code').notNull().unique(), // unique template identifier
    subject:   text('subject').notNull(),
    body:      text('body').notNull(),
    status:    text('status').notNull().default('active'), // 'active' | 'inactive'
    allowTo:   text('allow_to'),
    emailType: text('email_type'),
    createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
  },
  (table) => ({
    codeIdx:   index('email_templates_code_idx').on(table.code),
    statusIdx: index('email_templates_status_idx').on(table.status),
  }),
)

export type EmailTemplate    = typeof emailTemplates.$inferSelect
export type NewEmailTemplate = typeof emailTemplates.$inferInsert

// ─── Email Phrases ──────────────────────────────────────────────────────────

export const emailPhrases = sqliteTable(
  'email_phrases',
  {
    id:         integer('id').primaryKey({ autoIncrement: true }),
    templateId: integer('template_id').notNull().references(() => emailTemplates.id, { onDelete: 'cascade' }),
    key:        text('key').notNull(),
    value:      text('value').notNull(),
    createdAt:  text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt:  text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    templateIdIdx: index('email_phrases_template_id_idx').on(table.templateId),
  }),
)

export type EmailPhrase    = typeof emailPhrases.$inferSelect
export type NewEmailPhrase = typeof emailPhrases.$inferInsert
