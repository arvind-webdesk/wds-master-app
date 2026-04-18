import { pgTable, serial, varchar, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core'

export const apiLogs = pgTable(
  'api_logs',
  {
    id:                  serial('id').primaryKey(),
    logType:             varchar('log_type', { length: 50 }),
    message:             text('message'),
    ip:                  varchar('ip', { length: 45 }),
    userAgent:           text('user_agent'),
    method:              varchar('method', { length: 10 }),
    url:                 text('url'),
    responseStatus:      integer('response_status'),
    responseBodyPreview: text('response_body_preview'),
    durationMs:          integer('duration_ms'),
    isError:             boolean('is_error').notNull().default(false),
    errorType:           varchar('error_type', { length: 100 }),
    errorStack:          text('error_stack'),
    source:              varchar('source', { length: 100 }),
    environment:         varchar('environment', { length: 20 }),
    dataKeys:            text('data_keys'),       // JSON array of top-level keys in request body
    responseHeaders:     text('response_headers'), // JSON stringified headers
    createdAt:           timestamp('created_at').defaultNow().notNull(),
    updatedAt:           timestamp('updated_at').defaultNow().notNull(),
    deletedAt:           timestamp('deleted_at'),
  },
  (table) => ({
    isErrorIdx:      index('api_logs_is_error_idx').on(table.isError),
    createdAtIdx:    index('api_logs_created_at_idx').on(table.createdAt),
    responseStatusIdx: index('api_logs_response_status_idx').on(table.responseStatus),
  }),
)

export type ApiLog    = typeof apiLogs.$inferSelect
export type NewApiLog = typeof apiLogs.$inferInsert
