import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * Project-scope documents uploaded during the setup wizard.
 *
 * Files live on the server filesystem at `uploads/scope/<id>/<filename>` —
 * the row stores only the metadata + relative path. Removed via the wizard
 * UI: we soft-delete (set deletedAt) so the row history is preserved.
 */
export const scopeDocuments = sqliteTable(
  'scope_documents',
  {
    id:          integer('id').primaryKey({ autoIncrement: true }),
    filename:    text('filename').notNull(),     // original filename, sanitized for display
    storedPath:  text('stored_path').notNull(),  // relative to project root, e.g. uploads/scope/12/spec.pdf
    mimeType:    text('mime_type').notNull(),
    sizeBytes:   integer('size_bytes').notNull(),
    uploadedBy:  integer('uploaded_by'),         // users.id (no FK; nullable for resilience)
    uploadedAt:  text('uploaded_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt:   text('deleted_at'),
  },
  (t) => ({
    deletedAtIdx: index('scope_documents_deleted_at_idx').on(t.deletedAt),
  }),
)

export type ScopeDocument    = typeof scopeDocuments.$inferSelect
export type NewScopeDocument = typeof scopeDocuments.$inferInsert
