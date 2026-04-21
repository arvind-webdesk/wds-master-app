# Module Spec: Sync History

- **Slug**: `sync-history`
- **CASL Subject**: `SyncRun` (new — must be added to `Subjects` union in `lib/acl/ability.ts`)
- **Permission module key**: `sync-history` (new — must be added to `lib/acl/permissions-map.ts` with actions `['view']`)
- **Mode**: `build`
- **Kind**: Read-only observability / audit view.

## 1. Overview

The Sync History module surfaces the contents of the existing `sync_runs` audit table: one row per sync attempt (running / ok / failed) produced by the Shopify and BigCommerce integration runners. This module **never creates, mutates, or deletes** rows through the UI — writes are owned exclusively by the integration sync engine (see `lib/integrations/`).

The dashboard provides:

- A unified, filterable list page across both platforms (platform, target, status, connection, date range, free-text search across error messages).
- A detail page at `/sync-history/[id]` showing the full run record including the error stack in a monospace, scrollable block.

No mutation endpoints exist in this module. No create/edit Sheet forms exist. The `sync_runs` table has no soft-delete column by design (rows are append-only per the schema comment), so list queries do **not** apply a `deletedAt IS NULL` filter.

## 2. Data model

### 2.1 Table: `sync_runs` (existing)

Schema already exists at `lib/db/schema/integrations.ts`. **Mirror exactly — do not modify in this spec's scope beyond the `connectionId` addendum in §2.3.** DB-layer tasks for the existing columns are **"already exists, skip"**.

| Column             | DB name            | Type                         | Nullable | Default              | Notes                                           |
| ------------------ | ------------------ | ---------------------------- | -------- | -------------------- | ----------------------------------------------- |
| `id`               | `id`               | `integer` PK autoincrement   | no       | —                    | Primary key                                     |
| `platform`         | `platform`         | `text`                       | no       | —                    | `'shopify'` \| `'bigcommerce'`                  |
| `target`           | `target`           | `text`                       | no       | —                    | `'products'` \| `'orders'` \| `'customers'`     |
| `status`           | `status`           | `text`                       | no       | —                    | `'running'` \| `'ok'` \| `'failed'`             |
| `recordsSeen`      | `records_seen`     | `integer`                    | no       | `0`                  | Count observed in source platform               |
| `recordsUpserted`  | `records_upserted` | `integer`                    | no       | `0`                  | Count written locally                           |
| `error`            | `error`            | `text`                       | yes      | —                    | Full error text / stack (free-form)             |
| `triggeredBy`      | `triggered_by`     | `integer`                    | yes      | —                    | `users.id`; no FK (table is append-only)        |
| `startedAt`        | `started_at`       | `text`                       | no       | `CURRENT_TIMESTAMP`  | ISO-ish timestamp                               |
| `finishedAt`       | `finished_at`      | `text`                       | yes      | —                    | ISO-ish timestamp; null while `status='running'`|

### 2.2 Existing indexes (already in schema)

- `sync_runs_platform_idx` on `platform`
- `sync_runs_target_idx` on `(platform, target)`
- `sync_runs_finished_at_idx` on `finished_at`

### 2.3 Planned addendum — `connectionId` FK

The Connections module (separate spec) introduces an `integration_connections` table. Once that lands, `sync_runs` MUST be extended with a connection FK so history can be filtered per connection. This is declared here for downstream planning but is **gated on the connections module** — `db-schema-builder` should produce this only when `integration_connections` exists.

Planned column:

| Column         | DB name         | Type                                                   | Nullable | Notes                                                                                            |
| -------------- | --------------- | ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `connectionId` | `connection_id` | `integer` referencing `integration_connections.id`     | yes      | Nullable for backfill of pre-existing rows; new rows MUST populate it. No `ON DELETE` cascade — history survives connection removal. |

Planned index: `sync_runs_connection_id_idx` on `connection_id`.

**Migration strategy** (for `db-schema-builder` to plan, not implement here):
1. Add nullable `connection_id INTEGER` column to `sync_runs`.
2. Add index on `connection_id`.
3. No backfill — legacy rows stay `NULL` and render in the UI as "(legacy)".
4. Update `lib/integrations/` writers to always set `connectionId` on new rows.

Until that migration lands, the API and UI MUST treat `connectionId` as **optional** — if the column does not yet exist, the list route's `connectionId` filter is a no-op (422 on use is acceptable; alternative: silently ignore with a server warning log — choose 422 for explicitness).

### 2.4 Types

- `SyncRun = typeof syncRuns.$inferSelect` (already exported from `lib/db/schema/integrations.ts`).
- No insert type is used by this module — writes come from the sync engine.
- `IntegrationPlatform = 'shopify' | 'bigcommerce'` and `IntegrationTarget = 'products' | 'orders' | 'customers'` are already exported from the same file and MUST be reused.

### 2.5 Derived fields (computed in API layer, not persisted)

| Field              | Derivation                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `durationMs`       | If `finishedAt` and `startedAt` both present: `Date.parse(finishedAt) - Date.parse(startedAt)`. Else `null`. Clamp to `>= 0`. |
| `connectionName`   | Resolved by joining `integration_connections` on `connectionId` (once the FK column exists). If `connectionId` is null or the join misses → `null` (UI renders "(legacy)"). |
| `triggeredByLabel` | Resolved by looking up `users` on `triggeredBy` and composing `${firstName} ${lastName}` (falling back to `email`). If null → `null` (UI renders "System"). |

## 3. ACL / CASL

### 3.1 Subject and actions

- **Subject**: `SyncRun` — **new**; add to the `Subjects` union in `lib/acl/ability.ts`.
- **DB module key**: `sync-history` — **new**; add to `PERMISSION_MODULES` in `lib/acl/permissions-map.ts` with `actions: ['view']`.
- **`moduleToSubject` map entry**: `'sync-history': 'SyncRun'` — add to `lib/acl/ability.ts`.
- **Actions granted**: `read` only. Mapped from DB action `view` via the existing `actionMap` (`view → read` is already wired).
- **Superadmin**: `manage all` — already covers this subject.

### 3.2 Server-side checks

Every route handler MUST:
1. Call `getSessionUser()` from `lib/auth/session.ts`. If no user → 401 `UNAUTHORIZED`.
2. Build ability with `defineAbilityFor(user)` and require `ability.can('read', 'SyncRun')`. If not → 403 `FORBIDDEN`.

### 3.3 Client-side gating

- Nav item for `/sync-history` MUST be hidden when `can('read', 'SyncRun')` is false.
- Both list and detail pages MUST early-return a "Forbidden" state when the ability fails (defense in depth — the API already enforces it).

### 3.4 Seed / migration expectations

- Add a `sync-history:view` permission row via the existing permissions seed mechanism.
- Grant `sync-history:view` to the `superadmin` role (redundant given `manage all`, but keep the matrix consistent).
- No other role-permission seeds are required — operators grant this per role in the Roles UI.

## 4. API routes

All routes live under `app/api/sync-history/`. Response envelope conventions (from `app/api/auth/login/route.ts`):

- Success: `{ data, meta? }` with 200.
- Error: `{ error: { message, code } }` with codes `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`.
- Validation errors: 422 with `VALIDATION_ERROR`.

### 4.1 `GET /api/sync-history` — list

**Purpose**: Paginated, filterable list of sync runs across all platforms.

**Auth**: session required; `read SyncRun` required.

**Query params** (all optional; validate with zod):

| Param          | Type / shape                                                          | Default      | Notes                                                                                 |
| -------------- | --------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `page`         | integer ≥ 1                                                           | `1`          |                                                                                       |
| `limit`        | integer in `{10, 20, 50, 100}`                                        | `20`         | Clamp otherwise → 422.                                                                |
| `sort`         | one of `startedAt`, `finishedAt`, `durationMs`, `recordsSeen`, `recordsUpserted` | `startedAt` | `durationMs` sorts by `(finished_at - started_at)` computed in SQL (julianday diff) or by `finishedAt` fallback with a documented caveat. |
| `order`        | `asc` \| `desc`                                                       | `desc`       |                                                                                       |
| `platform`     | `shopify` \| `bigcommerce`                                            | —            | Exact match.                                                                          |
| `target`       | `products` \| `orders` \| `customers`                                 | —            | Exact match.                                                                          |
| `status`       | `running` \| `ok` \| `failed`                                         | —            | Exact match.                                                                          |
| `connectionId` | integer ≥ 1                                                           | —            | Exact match. If the `connection_id` column does not yet exist → 422 `VALIDATION_ERROR` with message "connectionId filter is not yet available". |
| `dateFrom`     | ISO date/datetime string                                              | —            | Inclusive lower bound on `startedAt`.                                                 |
| `dateTo`       | ISO date/datetime string                                              | —            | Inclusive upper bound on `startedAt`.                                                 |
| `q`            | string, 1–200 chars                                                   | —            | Case-insensitive `LIKE '%q%'` across `error` only. Trim; empty-after-trim → ignore.   |
| `triggeredBy`  | integer ≥ 1                                                           | —            | Exact match on `triggered_by`.                                                        |

**Rules**:
- If both `dateFrom` and `dateTo` are provided and `dateFrom > dateTo` → 422 `VALIDATION_ERROR`.
- `q` must be trimmed; empty after trim → ignore filter.
- No `deletedAt` filter (the table has no soft delete).

**Response shape** (200):

```
{
  data: SyncRunListItem[],
  meta: { page, limit, total, totalPages, sort, order, filters: { ...echoed-normalized } }
}
```

`SyncRunListItem` is the projection for the table — omit the large `error` text:

- Include: `id`, `platform`, `target`, `status`, `recordsSeen`, `recordsUpserted`, `startedAt`, `finishedAt`, `durationMs` (derived), `connectionId`, `connectionName` (derived, null-safe), `triggeredBy`, `triggeredByLabel` (derived, null-safe), `hasError` (derived: `error !== null && error !== ''`).
- Exclude: `error` (full text is detail-only).

**Errors**:
- 401 `UNAUTHORIZED` — no session.
- 403 `FORBIDDEN` — ability denies.
- 422 `VALIDATION_ERROR` — bad query shape.
- 500 `INTERNAL_ERROR` — DB failure.

### 4.2 `GET /api/sync-history/[id]` — detail

**Purpose**: Full record for the detail page.

**Auth**: session required; `read SyncRun` required.

**Path params**: `id` — integer; non-numeric or non-positive → 422.

**Rules**:
- `WHERE id = :id`.
- Resolve `connectionName` and `triggeredByLabel` as in §2.5.

**Response shape** (200):

```
{
  data: {
    id,
    platform,
    target,
    status,
    recordsSeen,
    recordsUpserted,
    error,              // full text, may be null
    triggeredBy,
    triggeredByLabel,   // derived, may be null
    connectionId,       // may be null
    connectionName,     // derived, may be null
    startedAt,
    finishedAt,         // may be null
    durationMs          // derived, may be null
  }
}
```

**Errors**:
- 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 422 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 500 `INTERNAL_ERROR`.

### 4.3 No other routes

Explicitly **do not** create POST/PATCH/PUT/DELETE handlers. Writes to `sync_runs` are owned by `lib/integrations/` runners. The table is append-only.

## 5. UI

### 5.1 Routes

- `app/(dashboard)/sync-history/page.tsx` — list page (client component wrapping DataTable; server-side auth gate via parent layout or in-page redirect).
- `app/(dashboard)/sync-history/[id]/page.tsx` — detail page (server component that fetches the record server-side, renders the full run).

### 5.2 List page (`/sync-history`)

Uses `components/data-table/DataTable.tsx`. The toolbar slot carries the filter controls.

**Toolbar (above table)**:
- Free-text search input bound to `q` (debounced 300ms). Placeholder: `"Search error messages…"`.
- `Platform` select: `Any`, `Shopify`, `BigCommerce`.
- `Target` select: `Any`, `Products`, `Orders`, `Customers`.
- `Status` select: `Any`, `Running`, `OK`, `Failed`.
- `Connection` select: populated from `GET /api/integrations/connections` (once the connections module ships). Before it ships, render the control disabled with a tooltip `"Available after the Connections module is enabled"`. Options: `Any` + one entry per connection displayed as `${name} (${platform})`.
- Date range picker → `dateFrom` / `dateTo` (ISO). Presets: Last 1h, 24h, 7d, 30d, Custom.
- "Clear filters" button.
- "Refresh" button (manual only — see §7).

**URL state**: All filters plus `page`, `limit`, `sort`, `order` are mirrored into the URL query string (App Router `useSearchParams` + `router.replace`). Page load → filters re-hydrate from URL.

**Columns** (in order, with `getCanHide()` allowed on all except `startedAt` and `status`):

| Column id          | Header            | Cell                                                                                                                 | Sortable |
| ------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------- | -------- |
| `startedAt`        | Started           | Relative ("3m ago"), with absolute ISO on hover via `title` attr.                                                    | yes      |
| `connectionName`   | Connection        | Plain text; fallback `"(legacy)"` muted when null.                                                                   | no       |
| `platform`         | Platform          | Colored badge: Shopify = emerald, BigCommerce = sky. Text capitalized.                                               | no       |
| `target`           | Target            | Small muted badge: `products`, `orders`, `customers`.                                                                | no       |
| `status`           | Status            | Badge: `running` = amber (pulsing dot), `ok` = emerald, `failed` = rose.                                             | yes      |
| `durationMs`       | Duration          | `{n} ms` up to 5000, else `{n.n} s`, right-aligned, tabular-nums. Muted `—` if `finishedAt` is null.                 | yes      |
| `recordsSeen`      | Seen              | Integer, right-aligned, tabular-nums.                                                                                | yes      |
| `recordsUpserted`  | Upserted          | Integer, right-aligned, tabular-nums.                                                                                | yes      |
| `triggeredByLabel` | Triggered by      | Plain text, muted `"System"` if null. Hidden by default.                                                             | no       |
| `actions`          | (no header)       | Row-end kebab / "View" button → navigate to `/sync-history/[id]?from=<current-qs>`.                                  | no       |

- **Row click** anywhere in the row navigates to the detail page (same `?from=` handoff as the actions button) — no in-list Sheet for this module.
- `emptyMessage`: `"No sync runs match your filters."`.

**Data fetching**: match the pattern already adopted by `api-logs` / other list pages in this codebase (SWR or React Query — inspect existing list pages before choosing; if neither is present, `useEffect` + `fetch` with `AbortController`). MUST use `DataTable`'s `isLoading` prop for the skeleton and show a `sonner` error toast on fetch failure.

### 5.3 Detail page — `/sync-history/[id]`

Server component. Reads session; if no `SyncRun` read ability → render a standard Forbidden state. Fetches the record server-side (directly via db or via the detail API). If 404 → render `"This sync run no longer exists."` with a back link.

**Back button**: top-left, label `"Back to Sync History"`, href derived from the `from` query param if present, else `/sync-history`.

**Panel contents** (top to bottom):

1. **Header card**
   - `platform` badge + `target` badge.
   - `status` badge (colored as in list).
   - `startedAt` absolute + relative.
   - `finishedAt` absolute + relative, or `"—"` + `"(still running)"` if null.
   - `durationMs` large.

2. **Summary grid** (label / value pairs, 2-column on desktop):
   - `id`
   - `connectionName` (fallback `"(legacy)"` if null) + raw `connectionId`
   - `triggeredByLabel` (fallback `"System"`) + raw `triggeredBy`
   - `recordsSeen`
   - `recordsUpserted`
   - Ratio: `recordsUpserted / recordsSeen` rendered as `"{n}%"` (or `"—"` if `recordsSeen === 0`).

3. **Error details** (rendered only when `error` is non-null and non-empty):
   - Heading: `"Error"` in rose.
   - `error` rendered in a `<pre>` inside a scrollable container (`max-h-[480px]`, `overflow-auto`), monospace font, `whitespace-pre`, with a "Copy" button in the top-right.
   - Do **not** attempt to parse the error as JSON — render as-is.

4. **Footer**
   - `startedAt` ISO (copyable).
   - `finishedAt` ISO (copyable) or `"—"`.

**Loading states**: each section wrapped in a Skeleton while fetching.

### 5.4 Nav registration

Add an entry for `/sync-history` in the dashboard sidebar (currently `components/shell/Sidebar.tsx`).
- **Label**: `"Sync History"`
- **Icon**: `History` from `lucide-react`
- **Visibility**: only when `can('read', 'SyncRun')` — use the same client-side ability check pattern already used for other gated nav items.
- **Order**: place adjacent to the Integrations / Shopify / BigCommerce entries (after them, before the audit sections like API Logs / Activity Logs). UI builder picks the exact position to match the visual grouping of audit views.

### 5.5 Forms

**None.** This module has no create/edit forms, therefore no RHF + Zod client schemas, no mutation handlers, no sonner success toasts for writes. `sonner` is used only for fetch error toasts.

## 6. Validation (zod) — server side only

Two zod schemas total. Keep them in `app/api/sync-history/_validation.ts` (or co-located — builder's choice; not shared with the client because list filters are transformed into the query string).

1. `listQuerySchema` — shape per §4.1. Uses `z.enum` for `platform`, `target`, `status`, `sort`, `order`. Uses `z.coerce.number()` for `page`, `limit`, `connectionId`, `triggeredBy`. Uses `z.string().datetime({ offset: true })` (or loose `z.string()` plus explicit `Date.parse` check) for `dateFrom` / `dateTo`.
2. `idParamSchema` — `z.coerce.number().int().positive()`.

No client-side form schemas.

## 7. Observability / refresh behaviour

- The list UI MUST NOT auto-refresh on an interval < 30s by default. Prefer a manual "Refresh" button in the toolbar. Rationale: sync runs are low-frequency and the endpoint does a non-trivial join once `connectionId` is live.
- Optional (not required): if the UI builder wants live status for `running` rows, a tab-focus-triggered refetch is acceptable, but no polling.

## 8. Non-goals / out of scope

- No export endpoint (`export` action is not granted on `SyncRun`).
- No delete / bulk-delete UI (the table is append-only by design).
- No retry / re-trigger action here — retriggering a sync belongs to the Integrations module under the `integrations:sync` permission, not `sync-history:view`.
- No realtime / websocket streaming.
- No retention / purge job (belongs to a scheduled-job module, not this one).
- No inline Sheet detail; detail is a full page so error stacks have room to breathe.

## 9. Downstream task list

| Layer                     | File(s)                                                          | Status                                     |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| DB schema (existing cols) | `lib/db/schema/integrations.ts` (`syncRuns`)                     | **already exists, skip**                   |
| DB schema (addendum)      | `lib/db/schema/integrations.ts` — add `connectionId` + index     | build (gated on Connections module)        |
| DB migration              | new drizzle migration for `connection_id` column + index          | build (gated on Connections module)        |
| ACL subject               | `lib/acl/ability.ts` — add `SyncRun` to `Subjects`, add `'sync-history': 'SyncRun'` to `moduleToSubject` | build |
| Permission module key     | `lib/acl/permissions-map.ts` — add `{ key: 'sync-history', label: 'Sync History', actions: ['view'] }` | build |
| Seed                      | `scripts/seed.ts` — insert `sync-history:view` permission + grant to superadmin | build                  |
| API list route            | `app/api/sync-history/route.ts`                                  | build                                      |
| API detail route          | `app/api/sync-history/[id]/route.ts`                             | build                                      |
| Validation                | `app/api/sync-history/_validation.ts` (or co-located)            | build                                      |
| List page                 | `app/(dashboard)/sync-history/page.tsx`                          | build                                      |
| Detail page               | `app/(dashboard)/sync-history/[id]/page.tsx`                     | build                                      |
| List toolbar component    | `components/sync-history/SyncHistoryToolbar.tsx`                 | build                                      |
| List columns              | `components/sync-history/sync-history-columns.tsx`               | build                                      |
| Detail view component     | `components/sync-history/SyncRunDetail.tsx`                      | build                                      |
| Nav entry                 | `components/shell/Sidebar.tsx`                                   | build (one-line add, `History` icon)       |

## 10. Self-verification checklist

- [x] Subject declared (`SyncRun`) and explicitly flagged as **new** for `Subjects` union addition.
- [x] Existing `sync_runs` columns mirrored exactly and marked skip; planned `connectionId` addendum documented separately and gated on the Connections module.
- [x] No `deletedAt` filter applied (table is append-only by design; documented).
- [x] Response envelope matches `{ data, meta? }` / `{ error: { message, code } }` with the approved error-code set.
- [x] List page uses `components/data-table/DataTable.tsx`.
- [x] No create/edit/delete UI or endpoints specified.
- [x] CASL check is server-enforced on every route; client nav gated by the same ability.
- [x] Every field has a projection decision (list vs detail): `error` excluded from list, included in detail.
- [x] Derived fields (`durationMs`, `connectionName`, `triggeredByLabel`, `hasError`) have explicit derivation rules and null-safety.
- [x] Filter params fully enumerated with types, defaults, and validation rules including the `dateFrom > dateTo` guard.
- [x] Reuses existing types `IntegrationPlatform` and `IntegrationTarget` from `lib/db/schema/integrations.ts`.
- [x] Sidebar entry specified with `History` lucide icon and ability-gated visibility.
- [x] No source code emitted (types and shapes only).
