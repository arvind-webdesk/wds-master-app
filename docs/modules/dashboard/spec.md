# Module Spec: `dashboard`

> **Status:** build
> **Slug:** `dashboard`
> **CASL Subject:** `Dashboard` (already registered in `lib/acl/ability.ts`)
> **Permission module key:** `dashboard` (already in `lib/acl/permissions-map.ts` with action `view`)
> **Owner surface area:** `app/(dashboard)/dashboard/*`, `app/api/dashboard/*`
> **One-liner:** Home dashboard rendering live KPI cards (users, roles, API calls today) and a 7-day API-calls chart plus a recent activity feed, all wired to the existing DB.

This module introduces **no new tables**. It is a read-only aggregation surface on top of `users`, `roles`, `api_logs`, and the activity log source (see §1.3 — resolution required).

---

## 1. Data model

**No new tables.** All reads go through existing schema files. DB-layer tasks = **skip** (no migrations, no new drizzle tables).

### 1.1 `users` table — read-only (`lib/db/schema/users.ts`)

Columns used by this module:
- `id` (integer PK)
- `status` (`'active' | 'inactive'`) — used for "active users" KPI (`status = 'active'`).
- `deletedAt` (nullable) — all counts filter `deletedAt IS NULL`.
- `createdAt` — optionally surfaced for "new users (7d)" variant; not required.

### 1.2 `roles` table — read-only (`lib/db/schema/roles.ts`)

Columns used:
- `id` (integer PK)
- `deletedAt` (nullable) — count filter `deletedAt IS NULL`.

### 1.3 Activity source — `api_logs` (`lib/db/schema/api-logs.ts`)

The description references "activity-logs", but the only activity-shaped table present in `lib/db/schema/` is `api_logs`. For this spec we treat `api_logs` as the activity source. Columns used:

- `id` (integer PK)
- `logType` (text nullable)
- `message` (text nullable)
- `method` (text nullable, e.g. `GET`/`POST`)
- `url` (text nullable)
- `responseStatus` (integer nullable)
- `isError` (boolean, default `false`)
- `durationMs` (integer nullable)
- `createdAt` (text ISO, indexed via `api_logs_created_at_idx`)
- `deletedAt` (text nullable) — filter `deletedAt IS NULL` everywhere.

**Open question for product:** if a distinct `activity_logs` table is introduced later, swap the "recent activity" data source to it. Until then, "recent activity" = the latest non-deleted `api_logs` rows.

### 1.4 Time handling

`createdAt` is stored as a SQLite `text` with `(CURRENT_TIMESTAMP)` default (`YYYY-MM-DD HH:MM:SS`, UTC). For bucket aggregation:

- Use SQLite `date(created_at)` to group by day.
- Use `datetime('now', '-N days')` / `date('now', '-N days')` for window bounds. Never rely on JS `new Date()` to pre-compute bounds when the query can express them in SQL — avoids TZ drift between web host and DB.
- All timestamps in API responses are echoed as-is (ISO-ish strings). UI formats relative time client-side.

---

## 2. API surface

All handlers live under `app/api/dashboard/*/route.ts` (App Router). Response envelope is the canonical one:

- Success: `{ data, meta? }`
- Failure: `{ error: { message, code } }` with `code ∈ UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`.

All handlers:
1. Call `getSessionUser()` from `lib/auth/session`. If null → 401 `UNAUTHORIZED`.
2. Build ability via `defineAbilityFor(user)`.
3. Check `ability.can('read', 'Dashboard')`. If denied → 403 `FORBIDDEN`.
4. Validate query params with Zod. On failure → 422 `VALIDATION_ERROR` with `parsed.error.errors[0]?.message`.

### 2.1 `GET /api/dashboard/stats` — aggregate KPIs + 7-day timeseries + recent activity

- **File:** `app/api/dashboard/stats/route.ts`
- **CASL:** `read` `Dashboard`
- **Query params (Zod, all optional):**
  - `days?: number` — window size for the chart timeseries. Default `7`, min `1`, max `30`.
  - `activityLimit?: number` — number of recent activity rows to return. Default `10`, min `1`, max `50`.
- **Behavior:** Run in parallel (Promise.all), all filters `deletedAt IS NULL`:
  1. **totalUsers** — `SELECT count(*) FROM users WHERE deleted_at IS NULL`.
  2. **activeUsers** — `SELECT count(*) FROM users WHERE deleted_at IS NULL AND status = 'active'`.
  3. **totalRoles** — `SELECT count(*) FROM roles WHERE deleted_at IS NULL`.
  4. **apiCallsToday** — `SELECT count(*) FROM api_logs WHERE deleted_at IS NULL AND date(created_at) = date('now')`.
  5. **apiErrorsToday** — `SELECT count(*) FROM api_logs WHERE deleted_at IS NULL AND date(created_at) = date('now') AND is_error = 1`.
  6. **apiCallsSeries** — `SELECT date(created_at) as day, count(*) as total, sum(case when is_error = 1 then 1 else 0 end) as errors FROM api_logs WHERE deleted_at IS NULL AND date(created_at) >= date('now', '-' || ? || ' days') GROUP BY day ORDER BY day ASC`. Fill missing days client-side **or** in the handler by generating the full `days`-length sequence and left-joining in JS so the UI gets a dense array.
  7. **recentActivity** — `SELECT id, logType, message, method, url, responseStatus, isError, durationMs, createdAt FROM api_logs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?`.
- **Response 200:**
  ```json
  {
    "data": {
      "kpis": {
        "totalUsers":   42,
        "activeUsers":  39,
        "totalRoles":   5,
        "apiCallsToday": 1280,
        "apiErrorsToday": 7
      },
      "apiCallsSeries": [
        { "day": "2026-04-12", "total": 980,  "errors": 3 },
        { "day": "2026-04-13", "total": 1104, "errors": 1 },
        { "day": "2026-04-14", "total": 0,    "errors": 0 },
        { "day": "2026-04-15", "total": 1320, "errors": 5 },
        { "day": "2026-04-16", "total": 1450, "errors": 2 },
        { "day": "2026-04-17", "total": 1501, "errors": 4 },
        { "day": "2026-04-18", "total": 1280, "errors": 7 }
      ],
      "recentActivity": [
        {
          "id": 9931,
          "logType": "request",
          "message": "POST /api/users",
          "method": "POST",
          "url": "/api/users",
          "responseStatus": 201,
          "isError": false,
          "durationMs": 42,
          "createdAt": "2026-04-18 09:12:44"
        }
      ]
    },
    "meta": { "days": 7, "activityLimit": 10 }
  }
  ```
- **Caching:** `export const dynamic = 'force-dynamic'`. No HTTP cache headers. The UI polls/revalidates on mount and on focus.
- **Errors:**

| Situation                                        | Status | `code`             |
| ------------------------------------------------ | ------ | ------------------ |
| No session                                       | 401    | `UNAUTHORIZED`     |
| CASL denies `read Dashboard`                     | 403    | `FORBIDDEN`        |
| Zod failure on `days` / `activityLimit`          | 422    | `VALIDATION_ERROR` |
| DB / unexpected failure                          | 500    | `INTERNAL_ERROR`   |

### 2.2 No write endpoints

This module is strictly read-only. No `POST`/`PUT`/`PATCH`/`DELETE` routes under `/api/dashboard/*`.

---

## 3. UI surface

All pages live in `app/(dashboard)/dashboard/*` and render inside the dashboard shell. Data fetching: SWR (or equivalent fetch-in-effect) against `/api/dashboard/stats`. No mutations. Forms are not applicable here.

Animation rule: Framer Motion only for Sheet slide (not used on this page). Chart animations from the chart library are permitted (enter-only, no loops).

### 3.1 `app/(dashboard)/dashboard/page.tsx` — Home dashboard

- **Guard:** server component reads session via `getSessionUser()`; if missing → redirect to `/login`. If `!ability.can('read', 'Dashboard')` → render a minimal 403 state (card: "You do not have access to the dashboard. Contact an administrator."). Do **not** 500.
- **Data source:** single call to `GET /api/dashboard/stats?days=7&activityLimit=10`. One loading state, one error state covers the whole page. A small "Retry" button on error that re-fires the request.
- **Layout (top → bottom):**

  1. **Page header**
     - Title: "Dashboard".
     - Subtitle: "Overview of users, roles, and API activity."
     - Right side: small "Last updated · {relative}" text + refresh icon button that re-fetches.

  2. **KPI card grid** — 4 cards, CSS grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, gap `3`). Each card: muted label, large numeric value (tabular-nums), subtle icon top-right, optional helper text below.
     - **Total users** — value `kpis.totalUsers`. Helper: `{activeUsers} active`. Icon: `Users` (lucide).
     - **Active users** — value `kpis.activeUsers`. Helper: `{activeUsers / totalUsers}%` (computed client-side, guard divide-by-zero → show `—`). Icon: `UserCheck`.
     - **Roles** — value `kpis.totalRoles`. Helper: "configured". Icon: `Shield`.
     - **API calls today** — value `kpis.apiCallsToday`. Helper: `{apiErrorsToday} errors` in destructive colour if `> 0`, else muted. Icon: `Activity`.
     - **Loading state:** each card renders `Skeleton` for value + helper. Match final height to prevent layout shift.

  3. **API calls chart (7 days)** — single card, full width on mobile, `lg:col-span-2` in a two-column grid with the activity list on `lg+`.
     - **Card header:** title "API calls (last 7 days)", subtitle showing totals for the window (`sum(total)` / `sum(errors)`).
     - **Chart:** bar or area chart, x = `day` (formatted `MMM d`), y = `total`. Secondary series `errors` rendered as an overlay (stacked-below or separate thin bars in destructive colour). Tooltip shows `day`, `total`, `errors`. Gridlines muted. No legend needed if only two series — label inline.
     - **Library:** use the project's existing chart primitive (likely `recharts` via `components/ui/chart.tsx` if present; otherwise add a narrow wrapper). This spec does not mandate the library — downstream UI agent picks the one already wired in the repo.
     - **Empty window:** if every `total === 0`, render a centered muted message "No API activity in the last 7 days." instead of the chart.
     - **Loading state:** card-sized skeleton block (e.g. `h-64 w-full`).

  4. **Recent activity list** — card, `lg:col-span-1` alongside the chart.
     - **Card header:** title "Recent activity", subtitle "Latest 10 API events".
     - **List rows** (no DataTable here — it's a simple feed):
       - Left: method badge (`GET`/`POST`/…) coloured neutrally; `POST`/`PUT`/`PATCH`/`DELETE` each have a distinct subtle hue.
       - Middle (grows): first line `url` (monospace, truncate); second line `message` muted small text, also truncated.
       - Right: status pill showing `responseStatus` — green when `2xx`, amber `3xx`, red when `isError` or `>= 400`. Below it: relative time of `createdAt` (e.g. "2m ago").
     - **Row height:** compact, dividers `border-b border-border last:border-0`.
     - **Empty state:** "No activity yet."
     - **Loading state:** 6 skeleton rows.
     - **Link:** footer of card shows a "View all" link → `/api-logs` **only when** `ability.can('read', 'ApiLog')`. Otherwise hide.

- **Refetch triggers:** initial mount, manual refresh button, window focus (SWR default). No polling.
- **Error state:** inline destructive alert at top of page: "Failed to load dashboard. Retry". Cards/chart/list below show their own skeletons replaced by a dimmed empty state.
- **Accessibility:** KPI cards are `role="group"` with `aria-label` equal to their label; chart has an `aria-label` summarising totals; activity rows are `<li>` inside a `<ul>`.

### 3.2 Navigation entry

- `dashboard` is the default landing page after login. Ensure the dashboard sidebar "Dashboard" entry points to `/dashboard` and is visible when `ability.can('read', 'Dashboard')`.
- Add a Command Palette entry in `components/shell/CommandPalette.tsx` for "Go to Dashboard" → `/dashboard`, gated on the same ability check.

### 3.3 Route redirect

If `/` (root) currently redirects to the dashboard, ensure the redirect target is `/dashboard`. If the user lacks `read Dashboard` (but is authenticated), redirect to the first route they *do* have access to, or render the 403 state. Downstream UI agent decides based on existing routing conventions.

---

## 4. CASL wiring

### 4.1 Subject

`Dashboard` is already declared in `Subjects` in `lib/acl/ability.ts`. **No change required.**

### 4.2 Actions used

| Where                             | Action | Subject     |
| --------------------------------- | ------ | ----------- |
| `GET /api/dashboard/stats`        | `read` | `Dashboard` |
| `/dashboard` page guard           | `read` | `Dashboard` |
| Sidebar / Command Palette entry   | `read` | `Dashboard` |
| "View all" link to `/api-logs`    | `read` | `ApiLog`    |

### 4.3 Permission matrix

`lib/acl/permissions-map.ts` already lists `dashboard` with `['view']`. `view` maps via `actionMap` to CASL `read`. Superadmins (`manage all`) always pass.

### 4.4 No new subjects, no new actions

Do not add new entries to `Subjects` or `Actions`. Do not touch `moduleToSubject` / `actionMap`. Do not add new rows to `PERMISSION_MODULES`.

---

## 5. Downstream task checklist

### db-schema-builder
- [x] `users` — already exists, skip.
- [x] `roles` — already exists, skip.
- [x] `api_logs` — already exists, skip.
- [ ] **No migrations.** No new tables, no new indexes required — the existing `api_logs_created_at_idx` already supports the date-window aggregations.

### api-route-builder
- [ ] Create `app/api/dashboard/stats/route.ts` with `GET` handler.
- [ ] Zod-validate `days` (1–30, default 7) and `activityLimit` (1–50, default 10).
- [ ] Enforce session + `ability.can('read', 'Dashboard')`.
- [ ] Run the 7 queries in `Promise.all`. Densify the timeseries so missing days appear with `total: 0, errors: 0`.
- [ ] Return canonical `{ data, meta }` / `{ error }` envelope.
- [ ] `export const dynamic = 'force-dynamic'`.

### ui-dashboard-builder
- [ ] `app/(dashboard)/dashboard/page.tsx` — header, 4 KPI cards, 7-day chart, recent activity list.
- [ ] Reuse `Skeleton`, `Card`, existing chart primitive, `sonner` (for retry errors).
- [ ] Gate "View all activity" link behind `ability.can('read', 'ApiLog')`.
- [ ] Sidebar + Command Palette entries for `/dashboard`.
- [ ] 403 fallback state (no `read Dashboard`).

### casl-wiring
- [x] `Dashboard` subject — already present.
- [x] Permission map entry — already present (`dashboard` → `view`).
- [ ] Verify sidebar / Command Palette hide entries when `!can('read', 'Dashboard')`.
- [ ] Verify "View all" link hides when `!can('read', 'ApiLog')`.

---

## 6. Self-verification checklist

- [x] No new tables created; all reads go through existing schemas. `id`, `createdAt`, `updatedAt`, `deletedAt` already present on every consumed table.
- [x] SQLite + `drizzle-orm/sqlite-core` only — no pg-core.
- [x] Session access via `getSessionUser()`; session shape unchanged.
- [x] CASL subject `Dashboard` already exists; no new subjects invented. Actions limited to `read`.
- [x] Response envelope documented; error codes enumerated.
- [x] No list UI requiring `DataTable` (the activity feed is intentionally a simple list, not a paginated table).
- [x] No Sheet / create / edit flows — module is read-only.
- [x] No source code in this spec — only shapes, field names, validations, and SQL sketches.
- [x] All soft-delete filters (`deletedAt IS NULL`) explicitly specified on every query.
- [x] Timeseries boundaries expressed in SQL (`date('now', ...)`) to avoid TZ drift.
- [x] All new UI gates wired to existing CASL subjects (`Dashboard`, `ApiLog`).
