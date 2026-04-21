# Module Spec: `cron-sync`

> Written by the `module-architect` agent. Consumed by `db-schema-builder`,
> `api-route-builder`, `ui-dashboard-builder`, and `casl-wiring`.
> **No source code in this file — types, shapes, and behaviours only.**

## 1. Overview
- **Purpose**: Schedule recurring syncs of commerce data (products / orders / customers) from an existing `integration_connections` row (see sibling `connections` module). The UI lets admins create, edit, enable/disable, and delete schedules, and trigger an immediate "Run now" manual sync with a live progress bar. **There is NO real cron runner in this release** — schedules are stored and displayed (human-readable), and `nextRunAt` / `lastRunAt` are informational only. Only the manual "Run now" button (and an ad-hoc run endpoint) actually execute a sync; execution is a non-awaited background Promise inside the API process. A production deployment must replace this with a real worker (e.g. a cron container or queue consumer) that reads the `sync_schedules` rows and calls the same job-dispatch code path.
- **Module slug**: `cron-sync`
- **CASL Subject**: `SyncSchedule` (new — must be added to the `Subjects` union in `lib/acl/ability.ts`)
- **Sidebar entry?** yes
- **Read-only?** no

## 2. Data model — `lib/db/schema/cron-sync.ts`

Two new tables are introduced. A third existing table (`sync_runs`, already defined in `lib/db/schema/integrations.ts`) is **written to** when a manual job completes, so the existing Sync History UI continues to surface these runs.

### 2.1 `sync_schedules`

| Column (TS)       | DB name           | Drizzle type                                                                 | Constraints                                       | Notes                                                        |
|-------------------|-------------------|------------------------------------------------------------------------------|---------------------------------------------------|--------------------------------------------------------------|
| `id`              | `id`              | `integer('id').primaryKey({ autoIncrement: true })`                          | PK                                                | always                                                       |
| `connectionId`    | `connection_id`   | `integer('connection_id').references(() => integrationConnections.id, { onDelete: 'cascade' })` | notNull, FK               | from sibling `connections` module                            |
| `target`          | `target`          | `text('target')`                                                             | notNull                                           | enum string: `'products' \| 'orders' \| 'customers'`         |
| `cronExpression`  | `cron_expression` | `text('cron_expression')`                                                    | notNull                                           | standard 5-field cron (`m h dom mon dow`), parsed via `cron-parser` / `cronstrue` on the client |
| `enabled`         | `enabled`         | `integer('enabled', { mode: 'boolean' }).default(true).notNull()`            | notNull                                           | when false, a future real runner must skip this row          |
| `lastRunAt`       | `last_run_at`     | `text('last_run_at')`                                                        | nullable                                          | informational; bumped by the Run-now handler on completion   |
| `nextRunAt`       | `next_run_at`     | `text('next_run_at')`                                                        | nullable                                          | informational; recomputed from `cronExpression` on create / update |
| `createdAt`       | `created_at`      | `text('created_at').default(sql\`(CURRENT_TIMESTAMP)\`).notNull()`           |                                                   | always                                                       |
| `updatedAt`       | `updated_at`      | `text('updated_at').default(sql\`(CURRENT_TIMESTAMP)\`).notNull()`           |                                                   | bump on PATCH                                                |
| `deletedAt`       | `deleted_at`      | `text('deleted_at')`                                                         | nullable                                          | soft-delete                                                  |

**Indexes**:
- `sync_schedules_connection_id_idx` on `connection_id`
- `sync_schedules_enabled_idx` on `enabled`
- `sync_schedules_deleted_at_idx` on `deleted_at`

**Uniqueness**: one schedule per `(connectionId, target)` among non-deleted rows. Enforced at the API layer (CONFLICT 409) rather than a partial unique index, since SQLite partial-unique support is limited and soft-deleted rows may repeat.

### 2.2 `sync_jobs`

Short-lived rows representing a single manual / ad-hoc run. Polled by the UI for progress. On completion, the handler **copies** a summary row into the existing `sync_runs` audit table so the Sync History module already in the app renders it. `sync_jobs` rows are kept (not deleted) so a user can revisit the final status; a future cleanup task may prune rows older than N days.

| Column (TS)       | DB name            | Drizzle type                                                        | Constraints         | Notes                                                                             |
|-------------------|--------------------|---------------------------------------------------------------------|---------------------|-----------------------------------------------------------------------------------|
| `id`              | `id`               | `integer('id').primaryKey({ autoIncrement: true })`                 | PK                  |                                                                                   |
| `connectionId`    | `connection_id`    | `integer('connection_id').references(() => integrationConnections.id, { onDelete: 'cascade' })` | notNull, FK | denormalized for easy listing                                                     |
| `target`          | `target`           | `text('target')`                                                    | notNull             | `'products' \| 'orders' \| 'customers'`                                           |
| `status`          | `status`           | `text('status').default('queued').notNull()`                        | notNull             | `'queued' \| 'running' \| 'ok' \| 'failed'`                                       |
| `progress`        | `progress`         | `integer('progress').default(0).notNull()`                          | notNull (0–100)     | percentage; worker updates as pages iterate                                       |
| `recordsSeen`     | `records_seen`     | `integer('records_seen').default(0).notNull()`                      | notNull             |                                                                                   |
| `recordsUpserted` | `records_upserted` | `integer('records_upserted').default(0).notNull()`                  | notNull             |                                                                                   |
| `error`           | `error`            | `text('error')`                                                     | nullable            | populated when `status = 'failed'`                                                |
| `triggeredBy`     | `triggered_by`     | `integer('triggered_by')`                                           | nullable (no FK)    | `users.id` of the actor; no FK so audit survives user deletion                    |
| `startedAt`       | `started_at`       | `text('started_at').default(sql\`(CURRENT_TIMESTAMP)\`).notNull()`  | notNull             | set at row creation                                                               |
| `finishedAt`      | `finished_at`      | `text('finished_at')`                                               | nullable            | set when status transitions to `ok` or `failed`                                   |

**No `createdAt` / `updatedAt` / `deletedAt`** — this table is an append-mostly job log; `startedAt` serves as creation time and the row is never soft-deleted.

**Indexes**:
- `sync_jobs_connection_id_idx` on `connection_id`
- `sync_jobs_status_idx` on `status`
- `sync_jobs_started_at_idx` on `started_at`

### 2.3 `sync_runs` (existing — write-only touch)

Already defined in `lib/db/schema/integrations.ts`. **Not re-declared here.** When a `sync_jobs` row reaches terminal state (`ok` | `failed`), the handler inserts a matching `sync_runs` row with:
- `platform` = the connection's platform (looked up via `integration_connections.platform`)
- `target`, `status`, `recordsSeen`, `recordsUpserted`, `error`, `triggeredBy` copied from the job
- `startedAt` = job.startedAt, `finishedAt` = job.finishedAt

**Relations** (to add in `lib/db/relations.ts`):
- `sync_schedules.connectionId` → `integration_connections.id` (one connection → many schedules)
- `sync_jobs.connectionId` → `integration_connections.id` (one connection → many jobs)
- Back-refs on `integration_connections`: `schedules: many(syncSchedules)`, `jobs: many(syncJobs)`

**Types to export** (from the new schema file):
- `SyncSchedule = typeof syncSchedules.$inferSelect`
- `NewSyncSchedule = typeof syncSchedules.$inferInsert`
- `SyncJob = typeof syncJobs.$inferSelect`
- `NewSyncJob = typeof syncJobs.$inferInsert`
- Re-export string-literal helpers: `SyncTarget = 'products' | 'orders' | 'customers'`, `SyncJobStatus = 'queued' | 'running' | 'ok' | 'failed'`

## 3. API surface

Response shape (enforced):
- Success: `{ data: T, meta?: { total, page, limit } }`
- Error:   `{ error: { message: string, code: ErrorCode } }`
- Codes: `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`

All routes:
1. Call `getSessionUser()`; null → 401 `UNAUTHORIZED`.
2. Build `defineAbilityFor(user)`; CASL check fails → 403 `FORBIDDEN`.
3. List/get: filter `isNull(syncSchedules.deletedAt)`.
4. On any body referencing `connectionId`, verify the row exists and is not soft-deleted in `integration_connections`; else 422 `VALIDATION_ERROR` with message `"Connection not found"`.

### 3.1 Schedule CRUD

| Method | Path                            | CASL check                                           | Zod body/query                                                                                                                 | Success returns                                                                 | Status |
|--------|---------------------------------|------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|--------|
| GET    | `/api/cron-sync`                | `can('read', 'SyncSchedule')`                        | query: `page?=1, limit?=20 (max 100), search?=string, connectionId?=number, target?=enum, enabled?='true'\|'false', sort?=string, order?='asc'\|'desc'` | `{ data: (SyncSchedule & { connection: { id, name, platform } })[], meta: { total, page, limit } }` | 200    |
| POST   | `/api/cron-sync`                | `can('create', 'SyncSchedule')`                      | `{ connectionId, target, cronExpression, enabled?=true }`                                                                      | `{ data: SyncSchedule }` (also computes + stores `nextRunAt`)                   | 201    |
| GET    | `/api/cron-sync/[id]`           | `can('read', 'SyncSchedule')`                        | —                                                                                                                              | `{ data: SyncSchedule & { connection: { id, name, platform } } }`               | 200    |
| PATCH  | `/api/cron-sync/[id]`           | `can('update', 'SyncSchedule')`                      | partial of POST body                                                                                                           | `{ data: SyncSchedule }` (recompute `nextRunAt` if `cronExpression` changed)    | 200    |
| DELETE | `/api/cron-sync/[id]`           | `can('delete', 'SyncSchedule')`                      | —                                                                                                                              | `{ data: { id } }` (soft-delete: set `deletedAt = CURRENT_TIMESTAMP`)           | 200    |

### 3.2 Run endpoints

| Method | Path                                       | CASL check                                            | Zod body                                                                     | Success returns                                           | Status |
|--------|--------------------------------------------|-------------------------------------------------------|------------------------------------------------------------------------------|-----------------------------------------------------------|--------|
| POST   | `/api/cron-sync/[id]/run`                  | `can('update', 'SyncSchedule')`                       | — (schedule supplies `connectionId` + `target`)                              | `{ data: { jobId: number, status: 'queued' } }` (202)     | 202    |
| POST   | `/api/cron-sync/run-ad-hoc`                | `can('update', 'SyncSchedule')`                       | `{ connectionId: number, target: 'products'\|'orders'\|'customers' }`        | `{ data: { jobId: number, status: 'queued' } }` (202)     | 202    |
| GET    | `/api/sync-jobs/[jobId]`                   | `can('read', 'SyncSchedule')`                         | —                                                                            | `{ data: SyncJob }`                                        | 200    |

Behaviour of POST run endpoints:
1. Validate input + connection existence (422 if bad).
2. Insert a `sync_jobs` row with `status='queued'`, `progress=0`, `triggeredBy=session.user.id`.
3. Fire-and-forget: call the internal job runner with the new `jobId` **without awaiting** (schedule with `queueMicrotask` / `void runJob(jobId)`). The handler returns the 202 response immediately.
4. The runner:
   - Flips the row to `status='running'`, `progress=1`.
   - Iterates pages from the platform adapter; after each page, updates `progress`, `recordsSeen`, `recordsUpserted`.
   - On success: `status='ok'`, `progress=100`, `finishedAt=now()`.
   - On error: `status='failed'`, `error=<string>`, `finishedAt=now()`.
   - On terminal status, inserts a matching row into `sync_runs` (see §2.3) and, for `/api/cron-sync/[id]/run` only, bumps the parent schedule's `lastRunAt = finishedAt`.
5. **Concurrency guard**: if a non-terminal (`queued` / `running`) `sync_jobs` row already exists for the same `(connectionId, target)`, return 409 `CONFLICT` with message `"A sync is already running for this connection and target"`. The UI must surface this.

Behaviour of GET `/api/sync-jobs/[jobId]`:
- 404 `NOT_FOUND` if no row.
- Caller must have `read SyncSchedule`; cross-tenant checks are out of scope for this release.
- Intended to be polled every ~1000 ms by the UI until `status` is `ok` or `failed`.

### 3.3 Zod rules

**Create schedule (`POST /api/cron-sync`)**:
- `connectionId`: `z.number().int().positive()` — must exist + not soft-deleted.
- `target`: `z.enum(['products', 'orders', 'customers'])`.
- `cronExpression`: `z.string().trim().min(9).max(120)` — additionally validated with a server-side helper (`cron-parser`) that must parse it; parse failure → 422 with message `"Invalid cron expression"` and path `["cronExpression"]`.
- `enabled`: `z.boolean().default(true)`.
- Uniqueness: reject (409 `CONFLICT`, `"A schedule already exists for this connection and target"`) if a non-deleted row already covers `(connectionId, target)`.

**Update schedule (`PATCH /api/cron-sync/[id]`)**:
- All fields optional. Re-run the uniqueness check if `connectionId` or `target` is included and produces a collision with a different non-deleted row.
- Re-validate `cronExpression` with `cron-parser` if present; recompute `nextRunAt`.

**Run ad-hoc (`POST /api/cron-sync/run-ad-hoc`)**:
- `connectionId`: `z.number().int().positive()`.
- `target`: `z.enum(['products', 'orders', 'customers'])`.

Pagination defaults: `page=1, limit=20` (max 100). Default sort: `createdAt desc`. Search is case-insensitive `LIKE` across `cronExpression` and the joined `integration_connections.name`.

## 4. UI surface

### 4.1 List page — `app/(dashboard)/cron-sync/page.tsx`

Uses `components/data-table/DataTable.tsx`. Client wrapper calls `/api/cron-sync`.

- **Columns** (left to right):

  | Header            | tanstack id        | Sortable | Notes                                                                                         |
  |-------------------|--------------------|----------|-----------------------------------------------------------------------------------------------|
  | Connection        | `connection`       | yes      | `connection.name` + small `connection.platform` badge (`shopify` / `bigcommerce`)              |
  | Target            | `target`           | yes      | capitalized badge: `Products` / `Orders` / `Customers`                                         |
  | Cron              | `cronExpression`   | no       | monospace raw expression; hover tooltip shows `cronstrue.toString(cronExpression)`             |
  | Human-readable    | `cronHuman`        | no       | muted text: output of `cronstrue.toString(cronExpression)` rendered inline                     |
  | Enabled           | `enabled`          | yes      | `Switch` component — toggling PATCHes `{ enabled: !enabled }` with optimistic update + toast   |
  | Last run          | `lastRunAt`        | yes      | localized datetime or `—`                                                                     |
  | Next run          | `nextRunAt`        | yes      | localized datetime or `—`; tooltip: "Informational only — no runner is active yet"            |
  | Actions           | `actions`          | no       | row menu + inline `Run now` button                                                            |

- **Toolbar**:
  - Debounced search input (300ms) → `?search=`
  - Filter chips: `Connection` (select, fetched from `/api/connections`), `Target` (`All / Products / Orders / Customers`), `Enabled` (`All / Enabled / Disabled`)
  - `Clear all` link when any filter active
  - Right-aligned primary button: `New schedule` (guarded by `can('create','SyncSchedule')`)
  - Secondary button: `Run ad-hoc` (guarded by `can('update','SyncSchedule')`) — opens a small modal with connection + target selects and a `Run` button hitting `POST /api/cron-sync/run-ad-hoc`; on 202 it opens the same progress modal described below.

- **Row actions** (dropdown, each guarded by CASL):
  - `Run now` (also shown as a visible button in the row) → `POST /api/cron-sync/[id]/run` → opens **Run-progress modal** (see §4.4).
  - `Edit` (`update`) → opens edit Sheet.
  - `Enable` / `Disable` (`update`) → PATCH `{ enabled }`.
  - `Delete` (`delete`) → confirm dialog → `DELETE /api/cron-sync/[id]` → sonner toast + table refresh.

- **Create**: right-side `<Sheet>` (Framer Motion slide) with RHF + Zod → `POST /api/cron-sync` → sonner success toast, close Sheet, refresh table.
- **Empty state**: "No sync schedules yet" + primary CTA `New schedule` (hidden if caller lacks `create`).
- **Loading**: DataTable `isLoading` skeletons.
- **URL-synced state**: `?page`, `?limit`, `?search`, `?connectionId`, `?target`, `?enabled`, `?sort`, `?order` via `useSearchParams` + `router.replace`.
- **Banner**: a dismissible info banner above the toolbar that reads *"Scheduled runs are not yet executed automatically — only ‘Run now’ triggers a sync. A background worker will be added in a future release."* (dismiss state stored in `localStorage` under `cron-sync:banner-dismissed`).

### 4.2 Detail page

Not required for this release. The list + sheet + progress modal cover all flows.

### 4.3 Sheet fields (Create / Edit) — `components/cron-sync/cron-sync-sheet.tsx`

Single Sheet drives both modes; `mode: 'create' | 'edit'` switches submit handler.

| Field             | Input control                                                                      | Zod validation                                                           | Required |
|-------------------|------------------------------------------------------------------------------------|--------------------------------------------------------------------------|----------|
| `connectionId`    | `Select` of connections (fetched from `/api/connections`, labeled `name (platform)`) | `z.number().int().positive()`                                          | yes      |
| `target`          | `Select` (`Products` / `Orders` / `Customers`)                                     | `z.enum(['products','orders','customers'])`                              | yes      |
| `cronExpression`  | `Input` monospace + helper text `"Minute Hour DayOfMonth Month DayOfWeek — e.g. 0 */6 * * *"` + live-rendered preview line below that calls `cronstrue.toString(value)` (client-side) and shows `"Invalid cron expression"` in the error color on parse failure. Below the preview, render three preset buttons that populate the input: `Every hour` (`0 * * * *`), `Every 6 hours` (`0 */6 * * *`), `Daily at midnight` (`0 0 * * *`). | `z.string().trim().min(9).max(120)` + refine using `cron-parser` | yes |
| `enabled`         | `Switch` (`Enabled` / `Disabled`)                                                  | `z.boolean()`                                                            | yes (default `true`) |

- Submit: `create` → `POST /api/cron-sync`; `edit` → `PATCH /api/cron-sync/[id]` with only changed fields.
- On 409 CONFLICT (duplicate `(connection, target)`): set a form-level error on the `target` field.
- On 422 VALIDATION_ERROR: map to the referenced field; default to top-of-form alert.
- Close behaviour: dismiss confirms only if form is dirty.

### 4.4 Run-progress modal — `components/cron-sync/run-progress-modal.tsx`

Opened by `Run now` (row), `Run ad-hoc` (toolbar), or auto-opened after either POST returns 202.

- Props: `jobId: number`, `onClose()`.
- On mount, sets up a polling loop (`setInterval` every 1000 ms) that calls `GET /api/sync-jobs/[jobId]` and updates local state.
- Renders:
  - A shadcn `Progress` bar bound to `job.progress`.
  - Status chip: `Queued` (muted), `Running` (blue, spinner), `Completed` (green), `Failed` (red).
  - Counters: `records seen: <n>`, `records upserted: <n>`.
  - If `status === 'failed'`, show `job.error` in a muted code block.
  - Footer buttons: `Close` (always), `View in Sync History` (only when terminal, links to the existing Sync History view filtered by platform+target).
- Polling stops as soon as `status` is `ok` or `failed`. The `Close` button is available throughout; closing does NOT cancel the backend job (there is no cancel endpoint in this release — note in a tooltip).
- On 409 response from the initial POST (concurrency guard): modal does not open; instead surface a sonner error toast with the server's message.

## 5. CASL wiring

- **Subject**: `SyncSchedule` — **new**, must be added to the `Subjects` union in `lib/acl/ability.ts`.
- **Actions used by this module**: `'read'`, `'create'`, `'update'`, `'delete'`. The "Run now" / "Run ad-hoc" capabilities piggy-back on `update SyncSchedule` (consistent with the existing treatment of `sync` → `update` in `actionMap`).
- **`moduleToSubject` map** (in `lib/acl/ability.ts`): add `'cron-sync': 'SyncSchedule'`.
- **Permissions map entry** (in `lib/acl/permissions-map.ts`):
  ```
  { key: 'cron-sync', label: 'Cron Sync', actions: ['view', 'add', 'edit', 'delete'] }
  ```
  No new entry is needed in `PermissionAction` (all four actions already exist).
- **Seed** (`scripts/seed.ts`): for the `superadmin` role, insert `role_permissions` rows for every `(cron-sync, action)` pair. Superadmin also resolves `manage all` at runtime but the rows are still seeded for matrix UI correctness.
- **No CASL check on `/api/sync-jobs/[jobId]` beyond `read SyncSchedule`** — the job row's contents are not tenant-scoped in this release.

## 6. Sidebar entry

- **Label**: `Cron Sync`
- **Icon**: `Clock` from `lucide-react`
- **Href**: `/cron-sync`
- **Order**: grouped under the Integrations section, directly below `Sync History` (or wherever the `connections` module places itself).
- **Visibility**: render only if `can('read', 'SyncSchedule')`.

## 7. File checklist

- [ ] `lib/db/schema/cron-sync.ts` — new file declaring `syncSchedules` + `syncJobs` + exported types/enums
- [ ] `lib/db/relations.ts` — add `syncSchedules ↔ integrationConnections`, `syncJobs ↔ integrationConnections`
- [ ] `lib/db/index.ts` — add barrel exports for `syncSchedules`, `syncJobs`
- [ ] `drizzle/migrations/*` — generate migration for the two new tables + indexes
- [ ] `app/api/cron-sync/route.ts` — GET (list with connection join), POST (create)
- [ ] `app/api/cron-sync/[id]/route.ts` — GET, PATCH, DELETE (soft)
- [ ] `app/api/cron-sync/[id]/run/route.ts` — POST (kick off manual run; fire-and-forget)
- [ ] `app/api/cron-sync/run-ad-hoc/route.ts` — POST (kick off manual run without a schedule)
- [ ] `app/api/sync-jobs/[jobId]/route.ts` — GET (poll progress)
- [ ] `lib/cron-sync/run-job.ts` — internal runner that updates `sync_jobs` progress and, on terminal, inserts into `sync_runs` + bumps `sync_schedules.lastRunAt` when applicable. Must reuse the platform iteration code from the existing integrations adapters. **Document at the top of the file that this is a dev-only in-process runner and must be replaced by a real worker in production.**
- [ ] `lib/cron-sync/cron.ts` — helpers: `parseCron(expr)` (wraps `cron-parser`), `computeNextRunAt(expr)`, `describeCron(expr)` (wraps `cronstrue`, client-safe)
- [ ] `app/(dashboard)/cron-sync/page.tsx` — list page with banner + toolbar + DataTable
- [ ] `components/cron-sync/cron-sync-columns.tsx` — TanStack column defs
- [ ] `components/cron-sync/cron-sync-sheet.tsx` — create/edit Sheet (RHF + Zod + live cron preview)
- [ ] `components/cron-sync/cron-sync-row-actions.tsx` — row dropdown + inline Run-now button
- [ ] `components/cron-sync/run-progress-modal.tsx` — progress modal with 1 s polling
- [ ] `components/cron-sync/run-ad-hoc-modal.tsx` — small modal for connection+target ad-hoc run
- [ ] `lib/acl/ability.ts` — add `'SyncSchedule'` to `Subjects` + `'cron-sync': 'SyncSchedule'` to `moduleToSubject`
- [ ] `lib/acl/permissions-map.ts` — add the `cron-sync` entry shown in §5
- [ ] `scripts/seed.ts` — seed `role_permissions` for superadmin on `cron-sync` × `[view, add, edit, delete]`
- [ ] `components/shell/Sidebar.tsx` — add `Cron Sync` nav link with `Clock` icon (guarded by `read SyncSchedule`)

## 8. Self-verification checklist (architect)

- [x] Every table has `id`; `sync_schedules` has `createdAt/updatedAt/deletedAt`; `sync_jobs` intentionally omits them (log-style).
- [x] All new subjects added to `Subjects` union (`SyncSchedule`).
- [x] `moduleToSubject` updated for the `cron-sync` permission-map key.
- [x] DB types are sqlite-only (`integer`, `text`, `mode: 'boolean'`, `sql\`(CURRENT_TIMESTAMP)\``).
- [x] Response shape documented; error codes drawn from the allowed set.
- [x] List page uses `components/data-table/DataTable.tsx`; create/edit via right-side Sheet.
- [x] No source code included — types, shapes, validations, and behaviours only.
