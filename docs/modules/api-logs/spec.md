# Module Spec: API Logs

- **Slug**: `api-logs`
- **CASL Subject**: `ApiLog` (already registered in `lib/acl/ability.ts`)
- **Permission module key**: `api-logs` (already in `lib/acl/permissions-map.ts` with actions `['view']`)
- **Mode**: `build`
- **Kind**: Read-only observability / audit view.

## 1. Overview

The API Logs module surfaces the contents of the `api_logs` table: one row per incoming API request (and/or background event) captured by the server's request-logging middleware. This module **never creates, mutates, or deletes** rows through the UI — writes are owned by the logging infrastructure. The dashboard provides:

- A filterable list page (method, status, error-only toggle, date range, free-text search).
- A detail view (Sheet slide-in from the right, with a deep-linkable `[id]` route as an equivalent fallback) showing the full request/response envelope including headers, error stack, body preview, and timing.

No mutation endpoints exist in this module. No create/edit Sheet forms exist. Soft-delete column exists on the table but is not surfaced; list queries MUST filter `deletedAt IS NULL`.

## 2. Data model

### 2.1 Table: `api_logs`

Schema already exists at `lib/db/schema/api-logs.ts`. **Mirror exactly — do not modify.** DB-layer tasks for this module are **"already exists, skip"**.

| Column                 | Type                                | Nullable | Default                 | Notes                                     |
| ---------------------- | ----------------------------------- | -------- | ----------------------- | ----------------------------------------- |
| `id`                   | `integer` PK autoincrement          | no       | —                       | Primary key                               |
| `logType`              | `text`                              | yes      | —                       | e.g. `request`, `job`, `webhook`          |
| `message`              | `text`                              | yes      | —                       | Free-form log message                     |
| `ip`                   | `text`                              | yes      | —                       | Client IP                                 |
| `userAgent`            | `text`                              | yes      | —                       | Client UA                                 |
| `method`               | `text`                              | yes      | —                       | HTTP verb (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`) |
| `url`                  | `text`                              | yes      | —                       | Request path + query                      |
| `responseStatus`       | `integer`                           | yes      | —                       | HTTP status code                          |
| `responseBodyPreview`  | `text`                              | yes      | —                       | Truncated response body                   |
| `durationMs`           | `integer`                           | yes      | —                       | Request handler duration                  |
| `isError`              | `integer` (boolean mode)            | no       | `false`                 | Explicit error flag                       |
| `errorType`            | `text`                              | yes      | —                       | e.g. `ValidationError`                    |
| `errorStack`           | `text`                              | yes      | —                       | Full stack trace                          |
| `source`               | `text`                              | yes      | —                       | Subsystem identifier                      |
| `environment`          | `text`                              | yes      | —                       | `development` / `production` / …          |
| `dataKeys`             | `text` (JSON array, stringified)    | yes      | —                       | Top-level keys of request body            |
| `responseHeaders`      | `text` (JSON object, stringified)   | yes      | —                       | Captured response headers                 |
| `createdAt`            | `text`                              | no       | `CURRENT_TIMESTAMP`     | ISO-ish timestamp                         |
| `updatedAt`            | `text`                              | no       | `CURRENT_TIMESTAMP`     | ISO-ish timestamp                         |
| `deletedAt`            | `text`                              | yes      | —                       | Soft delete marker (not exposed in UI)    |

### 2.2 Indexes (already in schema)

- `api_logs_is_error_idx` on `is_error`
- `api_logs_created_at_idx` on `created_at`
- `api_logs_response_status_idx` on `response_status`

### 2.3 Types

- `ApiLog = typeof apiLogs.$inferSelect` (exported from schema file).
- No insert type is used by this module's code — writes come from the logger library.

### 2.4 JSON field handling

- `dataKeys` and `responseHeaders` are persisted as stringified JSON. The detail API route MUST parse these and return structured values (`string[]` and `Record<string, string>` respectively). If parsing fails, return the raw string in a `__raw` field and include a `parseError: true` flag on the response for that field — never throw.

## 3. ACL / CASL

### 3.1 Subject and actions

- **Subject**: `ApiLog` (already in `Subjects` union in `lib/acl/ability.ts`).
- **Actions granted**: `read` only. Mapped from DB action `view` via `actionMap` in `ability.ts` — already wired.
- **Permission matrix entry**: `api-logs` → `['view']` in `lib/acl/permissions-map.ts` — already present.
- **Superadmin**: `manage all` — already covers this subject.

### 3.2 Server-side checks

Every route handler MUST:
1. Call `getSessionUser()` from `lib/auth/session.ts`. If no user → 401 `UNAUTHORIZED`.
2. Build ability with `defineAbilityFor(user)` and require `ability.can('read', 'ApiLog')`. If not → 403 `FORBIDDEN`.

### 3.3 Client-side gating

- Nav item for `/api-logs` MUST be hidden when `can('read', 'ApiLog')` is false.
- The list page MUST early-return a "Forbidden" state when the ability fails (defense in depth — the API already enforces it).

### 3.4 No new permission rows required

No migrations or seeds needed for ACL. The `api-logs:view` permission row is assumed to be seeded with the base permissions set; if missing, add a one-time seed row via the existing permissions seed mechanism — do not add module-specific migration code in this spec.

## 4. API routes

All routes live under `app/api/api-logs/`. Response envelope conventions (from `app/api/auth/login/route.ts`):

- Success: `{ data, meta? }` with 200.
- Error: `{ error: { message, code } }` with codes `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`.
- Validation errors: 422 with `VALIDATION_ERROR`.

### 4.1 `GET /api/api-logs` — list

**Purpose**: Paginated, filterable list of API logs.

**Auth**: session required; `read ApiLog` required.

**Query params** (all optional; validate with zod):

| Param       | Type / shape                                      | Default          | Notes |
| ----------- | ------------------------------------------------- | ---------------- | ----- |
| `page`      | integer ≥ 1                                       | `1`              |       |
| `limit`     | integer in `{10, 20, 50, 100}`                    | `20`             | Clamp otherwise → 422. |
| `sort`      | one of `createdAt`, `responseStatus`, `durationMs`| `createdAt`      |       |
| `order`     | `asc` \| `desc`                                   | `desc`           |       |
| `method`    | `GET`\|`POST`\|`PUT`\|`PATCH`\|`DELETE`\|`OPTIONS`\|`HEAD` | —        | Case-insensitive; normalize to upper. |
| `status`    | integer 100–599 OR bucket token `1xx`\|`2xx`\|`3xx`\|`4xx`\|`5xx` | —  | Bucket translates to `>= N00 AND < (N+1)00`. |
| `errorOnly` | boolean (`true`/`false`)                          | `false`          | When `true`, filter `isError = true`. |
| `from`      | ISO date/datetime string                          | —                | Inclusive lower bound on `createdAt`. |
| `to`        | ISO date/datetime string                          | —                | Inclusive upper bound on `createdAt`. |
| `q`         | string, 1–200 chars                               | —                | Case-insensitive `LIKE '%q%'` across `url`, `message`, `errorType`, `source`. |
| `logType`   | string, 1–64 chars                                | —                | Exact match. |
| `environment` | string, 1–32 chars                              | —                | Exact match. |

**Rules**:
- Always add `WHERE deletedAt IS NULL`.
- If both `from` and `to` are provided and `from > to` → 422 `VALIDATION_ERROR`.
- `q` must be trimmed; empty after trim → ignore filter.

**Response shape** (200):

```
{
  data: ApiLogListItem[],
  meta: { page, limit, total, totalPages, sort, order, filters: { ...echoed-normalized } }
}
```

`ApiLogListItem` is the projection for the table — omit large fields:

- Include: `id`, `createdAt`, `method`, `url`, `responseStatus`, `durationMs`, `isError`, `errorType`, `source`, `environment`, `ip`, `logType`, `message`.
- Exclude: `errorStack`, `responseBodyPreview`, `userAgent`, `responseHeaders`, `dataKeys`, `updatedAt`, `deletedAt`.

**Errors**:
- 401 `UNAUTHORIZED` — no session.
- 403 `FORBIDDEN` — ability denies.
- 422 `VALIDATION_ERROR` — bad query shape.
- 500 `INTERNAL_ERROR` — DB failure.

### 4.2 `GET /api/api-logs/[id]` — detail

**Purpose**: Full record for drawer / detail page.

**Auth**: session required; `read ApiLog` required.

**Path params**: `id` — integer; non-numeric → 422.

**Rules**:
- `WHERE id = :id AND deletedAt IS NULL`.
- Parse `dataKeys` and `responseHeaders` JSON (see §2.4).

**Response shape** (200):

```
{
  data: {
    ...allApiLogColumns,
    dataKeys:        string[]            | { __raw: string, parseError: true },
    responseHeaders: Record<string,string>| { __raw: string, parseError: true }
  }
}
```

All 20 columns are returned (except `deletedAt`, which is always null for a visible row and can be omitted).

**Errors**:
- 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 422 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 500 `INTERNAL_ERROR`.

### 4.3 No other routes

Explicitly **do not** create POST/PATCH/PUT/DELETE handlers. Writes to `api_logs` are owned by server middleware / a logger utility outside this module.

## 5. UI

### 5.1 Routes

- `app/(dashboard)/api-logs/page.tsx` — list page (client component wrapping DataTable, with server-side auth gate in a server parent or via redirect).
- `app/(dashboard)/api-logs/[id]/page.tsx` — deep-link detail page (server component that fetches via the detail API or directly via db, then renders the same detail panel used inside the Sheet).

### 5.2 List page (`/api-logs`)

Uses `components/data-table/DataTable.tsx`. The toolbar slot carries the filter controls.

**Toolbar (above table)**:
- Free-text search input bound to `q` (debounced 300ms).
- `Method` select: `Any`, `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`.
- `Status` select: `Any`, `2xx`, `3xx`, `4xx`, `5xx`, plus an "Exact…" option that reveals a numeric input.
- `Errors only` toggle (Switch or pressed Toggle button) — sets `errorOnly=true`.
- Date range picker → `from` / `to` (ISO). Presets: Last 15m, 1h, 24h, 7d, 30d, Custom.
- `Environment` select (populated statically: `development`, `production`, plus any detected values — if detection is not trivial, ship a static list and leave a TODO).
- "Clear filters" button.

**URL state**: All filters plus `page`, `limit`, `sort`, `order` are mirrored into the URL query string (App Router `useSearchParams` + `router.replace`). Page loads from URL → filters re-hydrate.

**Columns** (in order, with `getCanHide()` allowed on all except `createdAt` and `url`):

| Column id        | Header     | Cell                                                                                                  | Sortable |
| ---------------- | ---------- | ----------------------------------------------------------------------------------------------------- | -------- |
| `createdAt`      | Time       | Relative ("3m ago"), with absolute ISO on hover via title attr.                                        | yes      |
| `method`         | Method     | Colored badge (GET=slate, POST=emerald, PUT=amber, PATCH=amber, DELETE=rose, other=muted).             | no       |
| `url`            | URL        | Monospace, truncated with ellipsis + full value on hover. Click opens detail Sheet.                    | no       |
| `responseStatus` | Status     | Badge colored by bucket: 2xx=emerald, 3xx=sky, 4xx=amber, 5xx=rose, null=muted.                        | yes      |
| `durationMs`     | Duration   | `{n} ms`, right-aligned, tabular-nums. Muted if null.                                                  | yes      |
| `isError`        | Error      | Small red dot + `errorType` label when true; otherwise empty.                                          | no       |
| `source`         | Source     | Plain text, muted.                                                                                    | no       |
| `environment`    | Env        | Badge (`prod`=rose outline, `dev`=slate outline, etc.). Hidden by default.                             | no       |
| `ip`             | IP         | Monospace. Hidden by default.                                                                         | no       |
| `logType`        | Type       | Plain text. Hidden by default.                                                                        | no       |

- `emptyMessage`: `"No API logs match your filters."`.
- Clicking a row (or a dedicated "View" action at row end) opens the detail Sheet for that row's `id`.

**Data fetching**: SWR or React Query (whichever is already adopted in the codebase — inspect `components/shell/` and existing list pages; if neither present, use `useEffect` + `fetch` with an AbortController — spec leaves the choice to the UI builder but requires: loading skeleton via `DataTable`'s `isLoading` prop, toast via `sonner` on error).

### 5.3 Detail Sheet (in-list) and `[id]` page

Both render the **same** `<ApiLogDetailPanel logId={id} />` component.

**Sheet**:
- Right-side `Sheet` (shadcn), width `max-w-2xl` / `w-[720px]` on desktop, full-width on mobile.
- Framer Motion slide animation is allowed here (this is the only place it's permitted in this module).
- Open state mirrored to URL as `?log=<id>` so a Sheet-open state is shareable without navigating to the full page.

**`[id]` page**:
- Server component. Reads session; if no `ApiLog` read ability → render a standard Forbidden state.
- Fetches the record and renders `<ApiLogDetailPanel>` inside a normal page container with a back button to `/api-logs` preserving prior query string (from a `from` query param if present, else just `/api-logs`).

**Panel contents** (sections, top to bottom):

1. **Header**
   - `method` badge + `url` (monospace, selectable, with copy button).
   - `responseStatus` badge + `durationMs`.
   - `createdAt` absolute + relative.
   - Error indicator if `isError`.

2. **Summary grid** (label / value pairs, 2-column on desktop):
   - `id`, `logType`, `source`, `environment`, `ip`, `userAgent` (truncated w/ expand), `message`.

3. **Request data keys** (`dataKeys`)
   - Render as chip list of parsed keys. If `parseError`, show `__raw` in a muted code block.

4. **Response**
   - `responseStatus` (repeated here with bucket color).
   - `responseHeaders` rendered as a key/value table. If parse failed, raw block.
   - `responseBodyPreview` in a `<pre>` with copy button; truncated to 4000 chars in display with a "Show all" toggle.

5. **Error details** (only if `isError` or `errorStack` or `errorType`):
   - `errorType` as a rose-tinted label.
   - `errorStack` in a scrollable monospace block with copy button.

6. **Footer**
   - `createdAt` / `updatedAt`.

**Loading states**: each section wrapped in Skeleton while fetching.

**Forbidden / not found**: detail fetch 403 → render `"You don't have permission to view this log."`; 404 → `"This log no longer exists."`.

### 5.4 Nav registration

Add an entry for `/api-logs` in the dashboard nav config (wherever existing modules register themselves — likely `components/shell/` or a nav config file). Icon: `ScrollText` or `FileJson` from `lucide-react`. Visible only when `can('read', 'ApiLog')`.

### 5.5 Forms

**None.** This module has no create/edit forms, therefore no RHF + Zod schemas, no mutation handlers, no sonner success toasts for writes. `sonner` is used only for fetch error toasts.

## 6. Validation (zod) — server side only

Two zod schemas total. Keep them in `app/api/api-logs/_validation.ts` (or co-located — UI builder's choice, but not shared with the client since the list filters are transformed into the query string).

1. `listQuerySchema` — shape per §4.1.
2. `idParamSchema` — `z.coerce.number().int().positive()`.

No client-side form schemas.

## 7. Observability / self-reference caveat

Because this module's list route is itself an API call, it will generate rows in `api_logs` when the request logger is active. Two requirements:

- The request logger MUST skip (or tag as `logType = 'internal'`) requests to `/api/api-logs/*` to avoid recursive noise — document this expectation but do not implement it here.
- The list UI MUST NOT auto-refresh on an interval < 30s by default. A manual "Refresh" button in the toolbar is the preferred affordance.

## 8. Non-goals / out of scope

- No export endpoint (`export` action is not granted on `ApiLog`).
- No delete / bulk-delete UI (soft-delete column stays infra-only).
- No write endpoints of any kind.
- No realtime / websocket streaming.
- No log retention / purge job (belongs to a scheduled-job module, not this one).

## 9. Downstream task list

| Layer                  | File(s)                                                    | Status                   |
| ---------------------- | ---------------------------------------------------------- | ------------------------ |
| DB schema              | `lib/db/schema/api-logs.ts`                                | **already exists, skip** |
| ACL subject            | `lib/acl/ability.ts`                                       | **already exists, skip** |
| Permission module key  | `lib/acl/permissions-map.ts`                               | **already exists, skip** |
| API list route         | `app/api/api-logs/route.ts`                                | build                    |
| API detail route       | `app/api/api-logs/[id]/route.ts`                           | build                    |
| Validation             | `app/api/api-logs/_validation.ts` (or co-located)          | build                    |
| List page              | `app/(dashboard)/api-logs/page.tsx`                        | build                    |
| Detail page            | `app/(dashboard)/api-logs/[id]/page.tsx`                   | build                    |
| Detail panel component | `components/api-logs/ApiLogDetailPanel.tsx`                | build                    |
| List toolbar component | `components/api-logs/ApiLogsToolbar.tsx`                   | build                    |
| Nav entry              | existing nav config                                        | build (one-line add)     |

## 10. Self-verification checklist

- [x] Subject reused from existing `Subjects` union (`ApiLog`), not a new one.
- [x] Schema mirrored exactly (20 columns) and marked skip.
- [x] All read queries include `deletedAt IS NULL`.
- [x] Response envelope matches `{ data, meta? }` / `{ error: { message, code } }` with the approved error-code set.
- [x] List page uses `components/data-table/DataTable.tsx`.
- [x] No create/edit/delete UI or endpoints specified.
- [x] CASL check is server-enforced on every route; client nav gated by the same ability.
- [x] Every field has a projection decision (list vs detail).
- [x] JSON string columns (`dataKeys`, `responseHeaders`) have a documented parse strategy with a non-throwing fallback.
- [x] Filter params fully enumerated with types, defaults, and validation.
- [x] No source code emitted (types and shapes only).
