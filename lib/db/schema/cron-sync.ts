import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { connections } from './connections'

// ─── sync_schedules ──────────────────────────────────────────────────────────

export const syncSchedules = sqliteTable(
  'sync_schedules',
  {
    id:             integer('id').primaryKey({ autoIncrement: true }),
    connectionId:   integer('connection_id').notNull().references(() => connections.id, { onDelete: 'cascade' }),
    target:         text('target').notNull(),           // 'products' | 'orders' | 'customers'
    cronExpression: text('cron_expression').notNull(),  // standard 5-field cron
    enabled:        integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastRunAt:      text('last_run_at'),                // nullable; informational
    nextRunAt:      text('next_run_at'),                // nullable; informational
    createdAt:      text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt:      text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt:      text('deleted_at'),                 // nullable; soft-delete
  },
  (table) => ({
    connectionIdIdx: index('sync_schedules_connection_id_idx').on(table.connectionId),
    enabledIdx:      index('sync_schedules_enabled_idx').on(table.enabled),
    deletedAtIdx:    index('sync_schedules_deleted_at_idx').on(table.deletedAt),
  }),
)

export type SyncSchedule    = typeof syncSchedules.$inferSelect
export type NewSyncSchedule = typeof syncSchedules.$inferInsert

// ─── sync_jobs ────────────────────────────────────────────────────────────────

export const syncJobs = sqliteTable(
  'sync_jobs',
  {
    id:               integer('id').primaryKey({ autoIncrement: true }),
    connectionId:     integer('connection_id').notNull().references(() => connections.id, { onDelete: 'cascade' }),
    target:           text('target').notNull(),              // 'products' | 'orders' | 'customers'
    status:           text('status').notNull().default('queued'), // 'queued' | 'running' | 'ok' | 'failed'
    progress:         integer('progress').notNull().default(0),   // 0–100
    recordsSeen:      integer('records_seen').notNull().default(0),
    recordsUpserted:  integer('records_upserted').notNull().default(0),
    error:            text('error'),                         // nullable; populated on failure
    triggeredBy:      integer('triggered_by'),               // users.id (no FK — audit survives user deletion)
    startedAt:        text('started_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    finishedAt:       text('finished_at'),                   // nullable; set on terminal status
  },
  (table) => ({
    connectionIdIdx: index('sync_jobs_connection_id_idx').on(table.connectionId),
    statusIdx:       index('sync_jobs_status_idx').on(table.status),
    startedAtIdx:    index('sync_jobs_started_at_idx').on(table.startedAt),
  }),
)

export type SyncJob    = typeof syncJobs.$inferSelect
export type NewSyncJob = typeof syncJobs.$inferInsert

// ─── string-literal helpers ───────────────────────────────────────────────────

export type SyncTarget    = 'products' | 'orders' | 'customers'
export type SyncJobStatus = 'queued' | 'running' | 'ok' | 'failed'
