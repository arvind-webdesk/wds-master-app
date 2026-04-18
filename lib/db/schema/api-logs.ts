import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const apiLogs = sqliteTable(
  'api_logs',
  {
    id:                  integer('id').primaryKey({ autoIncrement: true }),
    logType:             text('log_type'),
    message:             text('message'),
    ip:                  text('ip'),
    userAgent:           text('user_agent'),
    method:              text('method'),
    url:                 text('url'),
    responseStatus:      integer('response_status'),
    responseBodyPreview: text('response_body_preview'),
    durationMs:          integer('duration_ms'),
    isError:             integer('is_error', { mode: 'boolean' }).notNull().default(false),
    errorType:           text('error_type'),
    errorStack:          text('error_stack'),
    source:              text('source'),
    environment:         text('environment'),
    dataKeys:            text('data_keys'),        // JSON array of top-level keys in request body
    responseHeaders:     text('response_headers'),  // JSON stringified headers
    createdAt:           text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt:           text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt:           text('deleted_at'),
  },
  (table) => ({
    isErrorIdx:        index('api_logs_is_error_idx').on(table.isError),
    createdAtIdx:      index('api_logs_created_at_idx').on(table.createdAt),
    responseStatusIdx: index('api_logs_response_status_idx').on(table.responseStatus),
  }),
)

export type ApiLog    = typeof apiLogs.$inferSelect
export type NewApiLog = typeof apiLogs.$inferInsert
