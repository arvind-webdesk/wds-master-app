# Module Spec: `activity-logs`

> Written by the `module-architect` agent. Consumed by `db-schema-builder`,
> `api-route-builder`, `ui-dashboard-builder`, and `casl-wiring`.
> **No source code in this file — types, shapes, and behaviours only.**

## 1. Overview
- **Purpose**: Read-only audit log of user actions across the dashboard. Provides a filterable list (by user, action, subject type, date range) and a single-row detail view so admins can investigate who did what and when. Rows are written by application code via a helper (see §8); this scaffold does **not** expose any create/update/delete API.
- **Module slug**: `activity-logs`
- **CASL Subject**: `ActivityLog` (already registered in `lib/acl/ability.ts`)
- **Sidebar entry?** yes
- **Read-only?** **yes** — only `read` action is exposed by this module. No create/update/delete/activate routes, no Sheet, no row mutations.

## 2. Data model — `lib/db/schema/activity-logs.ts`

> **Schema does NOT yet exist.** `db-schema-builder` must create this file from scratch following the shape below and run `drizzle-kit generate` + the app's migration runner to produce a new migration under `drizzle/`.

| Column (TS)   | DB name       | Drizzle type                                                      | Constraints                                                        | Notes                                                               |
|---------------|---------------|-------------------------------------------------------------------|--------------------------------------------------------------------|---------------------------------------------------------------------|
| `id`          | `id`          | `integer('id').primaryKey({ autoIncrement: true })`               | PK                                                                 | always                                                              |
| `userId`      | `user_id`     | `integer('user_id').references(() => users.id, { onDelete: 'set null' })` | nullable FK                                                | actor; null when system-originated or user later hard-deleted       |
| `action`      | `action`      | `text('action')`                                                  | notNull                                                            | free-form verb, lowercase snake_case, e.g. `'user.created'`, `'role.updated'`, `'auth.login'`, `'email_template.deleted'` |
| `subjectType` | `subject_type`| `text('subject_type')`                                            | notNull                                                            | PascalCase CASL subject name, e.g. `'User'`, `'Role'`, `'Permission'`, `'EmailTemplate'`, `'Setting'`, or `'System'` for non-entity events |
| `subjectId`   | `subject_id`  | `integer('subject_id')`                                           | nullable                                                           | id of the target row (null for aggregate/system events)             |
| `meta`        | `meta`        | `text('meta')`                                                    | nullable                                                           | JSON-stringified payload (diff, old/new values, reason). Never raw secrets. Producer is responsible for stringifying. |
| `ip`          | `ip`          | `text('ip')`                                                      | nullable                                                           | v4 or v6 string, length ≤ 64                                        |
| `userAgent`   | `user_agent`  | `text('user_agent')`                                              | nullable                                                           | raw UA string, length ≤ 500                                         |
| `createdAt`   | `created_at`  | `text('created_at').default(sql\`(CURRENT_TIMESTAMP)\`).notNull()` |                                                                   | ISO timestamp                                                       |
| `updatedAt`   | `updated_at`  | `text('updated_at').default(sql\`(CURRENT_TIMESTAMP)\`).notNull()` |                                                                   | audit rows are immutable in practice; column exists for convention parity |

> **No `deletedAt`.** Audit logs must **not** be soft-deletable from this module. If retention/pruning is ever required, it will be a separate scheduled job, not part of this spec.

**Indexes** (must be declared in the schema's second-arg callback):
- `activity_logs_user_id_idx` on `user_id`
- `activity_logs_action_idx` on `action`
- `activity_logs_subject_idx` on `(subject_type, subject_id)` — composite, supports "show everything that touched this entity"
- `activity_logs_created_at_idx` on `created_at` — supports date-range filters and default sort

**Relations** (add to `lib/db/relations.ts`):
- `activityLogs.userId` → `users.id` (many logs belong to at most one user)
- Back-ref on `users`: `activityLogs: many(activityLogs)` — enables the `users/[id]?tab=activity` query path from the `users` module spec.

**Types exported from schema file** (required):
- `ActivityLog    = typeof activityLogs.$inferSelect`
- `NewActivityLog = typeof activityLogs.$inferInsert`

**Barrel**: add `activity_logs` / `activityLogs` export to `lib/db/index.ts`.

## 3. API surface

Response shape (enforced):
- Success: `{ data: T, meta?: { total, page, limit } }`
- Error:   `{ error: { message: string, code: ErrorCode } }`
- Codes: `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`

All routes:
1. Call `getSessionUser()`; if null → 401 `UNAUTHORIZED`.
2. Build `defineAbilityFor(user)`; if CASL check fails → 403 `FORBIDDEN`.
3. **Read-only module** — only `GET` handlers are implemented. Any other method on these paths must be omitted (Next.js will return 405 for undefined methods).

| Method | Path                          | CASL check                     | Zod query / params                                                                                                                                         | Success returns                                                                   | Status |
|--------|-------------------------------|--------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------|--------|
| GET    | `/api/activity-logs`          | `can('read', 'ActivityLog')`   | query (see §3.1)                                                                                                                                           | `{ data: ActivityLogRow[], meta: { total, page, limit } }`                        | 200    |
| GET    | `/api/activity-logs/[id]`     | `can('read', 'ActivityLog')`   | params: `id` (coerced to `number().int().positive()`)                                                                                                      | `{ data: ActivityLogRow }` or 404 `NOT_FOUND` when no row                         | 200    |

`ActivityLogRow` is the full `ActivityLog` row **joined with a minimal actor projection**:
```
ActivityLogRow = ActivityLog & {
  user: { id: number; firstName: string; lastName: string; email: string } | null
}
```
The join is a left join on `users.id = activity_logs.user_id` (actor may be null).

### 3.1 List query schema — `GET /api/activity-logs`

| Key         | Zod                                                                    | Default | Notes                                                                                                  |
|-------------|------------------------------------------------------------------------|---------|--------------------------------------------------------------------------------------------------------|
| `page`      | `z.coerce.number().int().min(1)`                                       | `1`     |                                                                                                        |
| `limit`     | `z.coerce.number().int().min(1).max(100)`                              | `20`    |                                                                                                        |
| `userId`    | `z.coerce.number().int().positive().optional()`                        | —       | exact match on `activity_logs.user_id`                                                                 |
| `action`    | `z.string().trim().min(1).max(80).optional()`                          | —       | exact match (case-sensitive) on `action`                                                               |
| `subjectType` | `z.string().trim().min(1).max(40).optional()`                        | —       | exact match on `subject_type` — accepts any value but UI only offers known subjects                    |
| `subjectId` | `z.coerce.number().int().positive().optional()`                        | —       | must be combined with `subjectType` to be useful; not enforced in Zod but UI only offers when type set |
| `dateFrom`  | `z.string().datetime().optional()` (ISO 8601)                          | —       | inclusive lower bound on `created_at`                                                                  |
| `dateTo`    | `z.string().datetime().optional()` (ISO 8601)                          | —       | inclusive upper bound on `created_at`; if `dateTo < dateFrom` → 422 `VALIDATION_ERROR`                 |
| `search`    | `z.string().trim().min(1).max(120).optional()`                         | —       | case-insensitive `LIKE` across `action`, `subject_type`, `meta`                                        |
| `sort`      | `z.enum(['createdAt','action','subjectType','userId']).optional()`     | `createdAt` |                                                                                                     |
| `order`     | `z.enum(['asc','desc']).optional()`                                    | `desc`  |                                                                                                        |

Default sort: `createdAt desc`. Pagination meta is `{ total, page, limit }`.

### 3.2 Edge behaviours
- No soft-delete filter — this table has no `deletedAt`.
- No mutating endpoints in this module. Rows are produced only by `lib/logging/activity.ts` (see §8). `api-route-builder` must **not** scaffold POST/PATCH/DELETE routes here.
- 404 on detail route uses `{ error: { message: 'Activity log not found', code: 'NOT_FOUND' } }`.

## 4. UI surface

### 4.1 List page — `app/(dashboard)/activity-logs/page.tsx`

Uses `components/data-table/DataTable.tsx`. Client-side data fetching against `/api/activity-logs`. **No create Sheet, no row-mutation actions** — this module is strictly read-only.

- **Columns** (left to right):
  | Header       | tanstack id    | Sortable | Notes                                                                                                 |
  |--------------|----------------|----------|-------------------------------------------------------------------------------------------------------|
  | When         | `createdAt`    | yes      | localized relative + absolute on hover (e.g. `2m ago` / tooltip full ISO). Default sorted desc.       |
  | Actor        | `user`         | no       | `firstName + ' ' + lastName` + email subline; `System` muted label when `user` is null                |
  | Action       | `action`       | yes      | monospace badge of the raw action string                                                              |
  | Subject      | `subject`      | yes      | `subjectType` badge + `#subjectId` when present; if type is `System`, show em-dash                    |
  | IP           | `ip`           | no       | monospace, truncated with tooltip; `—` if null                                                        |
  | Actions      | `actions`      | no       | single item: `View details` → navigates to `/activity-logs/[id]`                                      |
- **Toolbar**:
  - Debounced search input (300ms) → `?search=`
  - Filter controls:
    - `User` — combobox of users (fetched lazily from `/api/users?limit=100` with type-ahead) → `?userId=`
    - `Action` — free-text input (exact match) → `?action=`
    - `Subject type` — select populated from the CASL `Subjects` union minus `'all'` → `?subjectType=`
    - `Date range` — two datetime pickers (`From`, `To`) → `?dateFrom=&dateTo=` (ISO 8601)
  - `Clear all` link when any filter active
  - **No primary "New" button** (read-only module).
- **Row behaviour**: clicking a row navigates to the detail page. No inline mutations.
- **Empty state**: "No activity recorded yet" or "No activity matches these filters" when filters are active.
- **Loading**: DataTable `isLoading` skeletons.
- **URL-synced state**: `?page`, `?limit`, `?userId`, `?action`, `?subjectType`, `?subjectId`, `?dateFrom`, `?dateTo`, `?search`, `?sort`, `?order` via `useSearchParams` + `router.replace`.

### 4.2 Detail page — `app/(dashboard)/activity-logs/[id]/page.tsx`

- **Header card**: `action` badge, `subjectType` + `#subjectId` link (when the subject is a known entity, link to `/[subject-slug]/[id]`), timestamp, actor (name + email, or `System`).
- **Metadata panel** (read-only key/value grid):
  - `ID`, `When` (ISO + relative), `Actor` (link to `/users/[id]` when non-null), `Action`, `Subject type`, `Subject id`, `IP`, `User agent`.
- **Meta payload panel**: pretty-printed JSON (client-side `JSON.parse(row.meta)` with safe fallback to raw text). Collapsed by default, with a `Copy` button (sonner toast on copy success).
- **No edit / delete / activate buttons anywhere.**
- **Not found**: if `GET /api/activity-logs/[id]` returns 404 → Next.js `notFound()`.

### 4.3 Embedded view — user detail `Activity` tab

The `users` module's detail page (`app/(dashboard)/users/[id]/page.tsx`, see that spec) calls `GET /api/activity-logs?userId=<id>` paginated at 20/page to populate its `Activity` tab. This module's API must support that query shape without change (already covered in §3.1).

## 5. CASL wiring

- **Subject**: `ActivityLog` — already present in the `Subjects` union in `lib/acl/ability.ts`. **Do not re-add.**
- **Actions used by this module**: `'read'` only.
- **Permissions map** (`lib/acl/permissions-map.ts`): the `activity-logs` entry already lists `['view']`. **No change required.**
- **Action map** (`actionMap` in `lib/acl/ability.ts`): existing `view → 'read'` mapping is sufficient. **No change required.**
- **Seed** (`scripts/seed.ts`): for the `superadmin` role ensure a `role_permissions` row exists for `(activity-logs, view)`. For `admin` role, include `(activity-logs, view)` if the seed already grants admins view access to other logs; otherwise leave admin-visibility to an operator.
- **Server-side enforcement**: route handlers must call `defineAbilityFor(session.user)` and return 403 when `can('read','ActivityLog')` is false.

## 6. Sidebar entry

- **Label**: `Activity Logs`
- **Icon**: `Activity` from `lucide-react`
- **Href**: `/activity-logs`
- **Order**: inside the `Audit` / `Logs` section, directly above `API Logs` (which shares the same grouping).
- **Visibility**: render only if `can('read', 'ActivityLog')`.

## 7. File checklist

- [ ] `lib/db/schema/activity-logs.ts` — **create** per §2 (new file)
- [ ] `lib/db/relations.ts` — add `activityLogs ↔ users` relation + `users.activityLogs` back-ref
- [ ] `lib/db/index.ts` — add barrel export for `activityLogs`
- [ ] `drizzle/` — new migration generated by `drizzle-kit` containing the `activity_logs` table and its four indexes
- [ ] `app/api/activity-logs/route.ts` — GET (list with filters per §3.1)
- [ ] `app/api/activity-logs/[id]/route.ts` — GET (detail); no PATCH/DELETE
- [ ] `app/(dashboard)/activity-logs/page.tsx` — list page (read-only DataTable + filters)
- [ ] `app/(dashboard)/activity-logs/[id]/page.tsx` — detail page (metadata grid + JSON meta panel)
- [ ] `components/activity-logs/activity-logs-columns.tsx` — TanStack column defs
- [ ] `components/activity-logs/activity-logs-filters.tsx` — toolbar filter controls (user combobox, action input, subject-type select, date range)
- [ ] `components/shell/Sidebar.tsx` — add `Activity Logs` nav link (guarded by `read ActivityLog`)
- [ ] `lib/acl/ability.ts` — **no change**
- [ ] `lib/acl/permissions-map.ts` — **no change**
- [ ] `scripts/seed.ts` — ensure `(activity-logs, view)` role-permission rows exist for relevant roles

## 8. Out-of-scope note: write helper (`lib/logging/activity.ts`)

A helper module will be added at `lib/logging/activity.ts` so that API routes and server actions elsewhere in the codebase can record audit rows. It is **intentionally not part of this scaffold** — do not generate it here. The helper is expected to expose a single async function that accepts `{ userId, action, subjectType, subjectId, meta, ip, userAgent }` and inserts into `activity_logs`, JSON-stringifying `meta` itself. The schema, indexes, and API defined in this spec are designed so that such a helper can be bolted on later without migration changes.

## 9. Self-verification checklist (architect)

- [x] Every table has `id`, `createdAt`, `updatedAt` (no `deletedAt` — documented exception per audit-retention rationale in §2).
- [x] Reuses existing CASL subject `ActivityLog`; does not invent a new one.
- [x] No source code in this file — types, column shapes, Zod rule descriptions only.
- [x] Read-only API surface (GET list + GET detail); no mutating routes scaffolded.
- [x] UI uses `components/data-table/DataTable.tsx`; no create Sheet (read-only).
- [x] Response shape `{ data, meta? }` / `{ error: { message, code } }` with the fixed code set.
- [x] All filter query keys enumerated with Zod rules and defaults.
- [x] Indexes specified (`user_id`, `action`, `(subject_type, subject_id)`, `created_at`).
- [x] Relation back-ref on `users` enables the `users/[id]?tab=activity` flow required by the `users` spec.
- [x] Write helper explicitly marked out-of-scope.
