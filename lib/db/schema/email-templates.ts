import { pgTable, serial, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core'

export const emailTemplates = pgTable(
  'email_templates',
  {
    id:        serial('id').primaryKey(),
    title:     varchar('title', { length: 255 }).notNull(),
    code:      varchar('code', { length: 100 }).notNull().unique(), // unique template identifier
    subject:   varchar('subject', { length: 500 }).notNull(),
    body:      text('body').notNull(),
    status:    varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'inactive'
    allowTo:   varchar('allow_to', { length: 100 }),
    emailType: varchar('email_type', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    codeIdx:   index('email_templates_code_idx').on(table.code),
    statusIdx: index('email_templates_status_idx').on(table.status),
  }),
)

export type EmailTemplate    = typeof emailTemplates.$inferSelect
export type NewEmailTemplate = typeof emailTemplates.$inferInsert

// ─── Email Phrases ──────────────────────────────────────────────────────────

export const emailPhrases = pgTable(
  'email_phrases',
  {
    id:         serial('id').primaryKey(),
    templateId: integer('template_id').notNull().references(() => emailTemplates.id, { onDelete: 'cascade' }),
    key:        varchar('key', { length: 100 }).notNull(),
    value:      text('value').notNull(),
    createdAt:  timestamp('created_at').defaultNow().notNull(),
    updatedAt:  timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    templateIdIdx: index('email_phrases_template_id_idx').on(table.templateId),
  }),
)

export type EmailPhrase    = typeof emailPhrases.$inferSelect
export type NewEmailPhrase = typeof emailPhrases.$inferInsert
