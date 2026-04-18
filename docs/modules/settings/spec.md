# Module Spec: `settings`

> **Status:** build
> **Slug:** `settings`
> **CASL Subject:** `Setting` (already registered in `lib/acl/ability.ts`)
> **Permission module key:** `settings` (already in `lib/acl/permissions-map.ts` with actions `view`, `edit`)
> **Owner surface area:** `app/(dashboard)/settings/*`, `app/api/settings/*`, `app/api/account/*`
> **One-liner:** A key/value settings editor plus a self-service profile page (`/settings/account`) that edits the currently signed-in user row.

This module has **two logically distinct surfaces** that share the same navigation area:

1. **System settings** — CRUD over the `settings` table (admin-only). Subject `Setting`.
2. **My account** — profile view/edit of the *current session user* via the `users` table. Subject `User` (scoped to `{ id: session.user.id }`).

---

## 1. Data model

### 1.1 `settings` table — **already exists**

File: `lib/db/schema/settings.ts`. **Do NOT recreate or migrate.** DB-layer tasks for this table = **skip**. Columns, mirrored for downstream agents:

| Column      | Type                                                            | Notes                                  |
| ----------- | --------------------------------------------------------------- | -------------------------------------- |
| `id`        | `integer` PK, autoIncrement                                     | Surrogate key                          |
| `key`       | `text` NOT NULL, UNIQUE                                         | Settings key (e.g. `site.name`)        |
| `value`     | `text` nullable                                                 | Raw string value; callers parse/encode |
| `createdAt` | `text` NOT NULL default `CURRENT_TIMESTAMP`                     | ISO timestamp string                   |
| `updatedAt` | `text` NOT NULL default `CURRENT_TIMESTAMP`                     | Bumped on every upsert                 |
| `deletedAt` | `text` nullable                                                 | Soft-delete marker                     |

Indexes: `settings_key_idx` on `(key)`.

Exported types: `Setting`, `NewSetting`.

Conventions:
- Key format: lowercase dot-separated namespace, `^[a-z0-9]+(\.[a-z0-9_-]+)+$`. Max length 128.
- Value: arbitrary string; nullable means "set but intentionally empty". Max length 10,000.
- `updatedAt` must be set to `CURRENT_TIMESTAMP` on every upsert.
- Soft-deletes: list and get filter `deletedAt IS NULL`. Delete sets `deletedAt = CURRENT_TIMESTAMP`.

### 1.2 `users` table — **already exists, read-only to this module**

File: `lib/db/schema/users.ts`. Used by the `/api/account` routes. The profile page may only update these fields for the signed-in user:

- `firstName` (string, 1–80)
- `lastName` (string, 1–80)
- `contactNo` (string nullable, 5–40)
- `image` (string nullable, URL, max 1024)
- `password` (only when `currentPassword` is also provided — see 2.2)

Fields that must **never** be writable through `/api/account`:
`id`, `email`, `status`, `userType`, `roleId`, `portal`, `resetPasswordToken`, `createdAt`, `updatedAt`, `deletedAt`.

---

## 2. API surface

All handlers live under `app/api/**/route.ts` (App Router). All responses use the canonical envelope:

- Success: `{ data, meta? }`
- Failure: `{ error: { message, code } }` where `code ∈ UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`

All handlers:
1. Call `getSessionUser()` from `lib/auth/session`. If null → 401 `UNAUTHORIZED`.
2. Build ability via `defineAbilityFor(user)`.
3. Check `ability.can(<action>, <subject>)`. If denied → 403 `FORBIDDEN`.
4. Validate input with Zod. On failure → 422 `VALIDATION_ERROR` with `parsed.error.errors[0]?.message`.

### 2.1 System settings

#### `GET /api/settings` — list keys

- **File:** `app/api/settings/route.ts`
- **CASL:** `read` `Setting`
- **Query params:**
  - `search?: string` — case-insensitive match on `key` or `value`
  - `page?: number` (default 1, min 1)
  - `limit?: number` (default 20, min 1, max 100)
  - `sort?: 'key' | 'updatedAt' | 'createdAt'` (default `key`)
  - `order?: 'asc' | 'desc'` (default `asc`)
- **Behavior:** Filter `deletedAt IS NULL`. Apply search / sort / paginate.
- **Response 200:**
  ```json
  {
    "data": [{ "id": 1, "key": "site.name", "value": "WDS", "createdAt": "...", "updatedAt": "..." }],
    "meta": { "page": 1, "limit": 20, "total": 42 }
  }
  ```

#### `GET /api/settings/[key]` — get by key

- **File:** `app/api/settings/[key]/route.ts`
- **CASL:** `read` `Setting`
- **Params:** `key` — URL-decoded settings key.
- **Behavior:** Lookup by `key` with `deletedAt IS NULL`. Not found → 404 `NOT_FOUND`.
- **Response 200:** `{ data: Setting }`

#### `PUT /api/settings/[key]` — upsert key

- **File:** `app/api/settings/[key]/route.ts`
- **CASL:** `update` `Setting` (view+edit mapped DB actions `view`/`edit` satisfy this — `edit` → `update` per `actionMap`)
- **Body (Zod):**
  - `value: string | null` (max 10,000)
- **Behavior:**
  1. Validate `key` path param matches `^[a-z0-9]+(\.[a-z0-9_-]+)+$` and length ≤ 128 → else 422.
  2. If a row exists (including soft-deleted): update `value`, set `updatedAt = CURRENT_TIMESTAMP`, clear `deletedAt`.
  3. Otherwise insert a new row with `key`, `value`.
- **Response 200:** `{ data: Setting }`
- **Conflicts:** none expected (key is the idempotency anchor). A concurrent insert race yielding a UNIQUE violation must be translated to 409 `CONFLICT`.

#### `DELETE /api/settings/[key]` — soft delete

- **File:** `app/api/settings/[key]/route.ts`
- **CASL:** `delete` `Setting`
  - **Note:** the permissions matrix currently exposes only `view` and `edit` for `settings`. A non-superadmin role therefore cannot delete. Superadmins (`manage all`) can. UI must hide the delete control when `!ability.can('delete', 'Setting')`.
- **Behavior:** If row exists and not already soft-deleted → set `deletedAt = CURRENT_TIMESTAMP`, bump `updatedAt`. Missing → 404.
- **Response 200:** `{ data: { id, key, deletedAt } }`

### 2.2 Account (self-service)

These routes operate on `session.user.id`. No `[id]` param — impersonation must never be possible through this surface.

#### `GET /api/account` — current profile

- **File:** `app/api/account/route.ts`
- **Auth:** session required (401 if missing). **No CASL check** — every authenticated user can read their own profile.
- **Behavior:** Select the user row where `id = session.user.id AND deletedAt IS NULL`. Strip `password` and `resetPasswordToken` — return `SafeUser`.
- **Response 200:**
  ```json
  {
    "data": {
      "id": 1, "firstName": "...", "lastName": "...", "email": "...",
      "contactNo": null, "image": null, "status": "active",
      "userType": "admin", "roleId": 2, "portal": null,
      "createdAt": "...", "updatedAt": "..."
    }
  }
  ```

#### `PATCH /api/account` — update own profile

- **File:** `app/api/account/route.ts`
- **Auth:** session required. **No CASL check** (self-edit is inherent; superadmin demotion of self is not possible here because the writable field list excludes role/status/userType).
- **Body (Zod, all optional; at least one key required):**
  - `firstName?: string` (1–80, trimmed)
  - `lastName?: string` (1–80, trimmed)
  - `contactNo?: string | null` (5–40, or null to clear)
  - `image?: string | null` (URL, max 1024, or null)
  - `currentPassword?: string` (min 1) — required iff `newPassword` is present
  - `newPassword?: string` (min 8, max 128)
- **Behavior:**
  1. If `newPassword` is set: load user row, `verifyPassword(currentPassword, user.password)`; mismatch → 422 `VALIDATION_ERROR` with message `Current password is incorrect`. Hash `newPassword` with the existing password helper before write.
  2. Build the update object from provided fields only. Set `updatedAt = CURRENT_TIMESTAMP`.
  3. Update where `id = session.user.id AND deletedAt IS NULL`.
  4. Rebuild the session `user` blob (first/last name/image) so the Topbar reflects changes on next navigation. Call `session.save()`.
- **Response 200:** `{ data: SafeUser }`
- **Never** return `password` or `resetPasswordToken`.

### 2.3 Error code quick reference

| Situation                                   | Status | `code`             |
| ------------------------------------------- | ------ | ------------------ |
| No session                                  | 401    | `UNAUTHORIZED`     |
| CASL denies action on `Setting`             | 403    | `FORBIDDEN`        |
| Key not found / user row missing            | 404    | `NOT_FOUND`        |
| Zod failure / bad key format / wrong pwd    | 422    | `VALIDATION_ERROR` |
| UNIQUE race on `key`                        | 409    | `CONFLICT`         |
| Unhandled                                   | 500    | `INTERNAL_ERROR`   |

---

## 3. UI surface

All pages live in `app/(dashboard)/settings/*` and render inside the dashboard shell. Data fetching: SWR or fetch-in-effect against the routes above. Mutations: `fetch` + `sonner` toasts. Forms: `react-hook-form` + `zodResolver`.

Animation rule: Framer Motion only for Sheet slide. Nothing else.

### 3.1 `app/(dashboard)/settings/page.tsx` — Key/value editor

- **Guard:** server component reads session via `getSessionUser()`; if `!ability.can('read', 'Setting')` → redirect to `/` or render a 403 state.
- **Layout:**
  - Page header: title "System Settings", subtitle "Manage application-wide key/value configuration."
  - Primary action button "New setting" (top-right). Disabled / hidden if `!ability.can('update', 'Setting')`.
  - `DataTable` from `components/data-table/DataTable.tsx` with:
    - **Columns:** `key` (sortable, monospace), `value` (truncated to 60 chars, hover for full), `updatedAt` (sortable, relative time), actions column (Edit / Delete icons).
    - **Toolbar:** search input (debounced 300ms) bound to `search` query param.
    - **Props wired:** `data`, `total`, `page`, `limit`, `isLoading`, `onPageChange`, `onLimitChange`, `onSortChange`, `toolbar`, `emptyMessage="No settings yet."`.
  - **Right-side Sheet** for create/edit:
    - Trigger: "New setting" button (create mode) or row Edit action (edit mode).
    - Fields: `key` (text, disabled in edit mode), `value` (textarea, 6 rows, max 10,000 chars with live counter).
    - Footer: Cancel / Save. Save shows spinner and disables while submitting.
    - On success: toast `Setting saved.`, close sheet, revalidate list.
  - **Delete confirm:** `AlertDialog`. Confirm copy: "Delete setting \"{key}\"? This can be restored by re-adding the key." On success toast `Setting deleted.`.
- **Empty state:** Empty list → DataTable `emptyMessage` plus a centered CTA "Add your first setting".
- **CASL in UI:** hide Edit action if `!can('update', 'Setting')`; hide Delete action if `!can('delete', 'Setting')`.

### 3.2 `app/(dashboard)/settings/account/page.tsx` — My account

- **Guard:** session required. No CASL — any signed-in user can view/edit their own profile.
- **Layout:** two-column card grid on desktop, stacked on mobile.
  - **Card 1 — Profile details** (form):
    - Avatar preview (square, 96px) sourced from `image` URL; fallback to initials.
    - Inputs: `firstName`, `lastName` (side-by-side), `email` (read-only, help text "Contact an admin to change your email"), `contactNo`, `image` (URL input with preview).
    - Submit "Save changes" → `PATCH /api/account` with only dirty fields.
    - Success toast `Profile updated.`. On RHF error, show inline field messages.
  - **Card 2 — Change password** (separate form):
    - Inputs: `currentPassword`, `newPassword`, `confirmNewPassword` (client-only zod refinement: must match `newPassword`).
    - Submit "Update password" → `PATCH /api/account` with `currentPassword` + `newPassword` only.
    - Success toast `Password updated.`, clear the form.
    - On 422 with "Current password is incorrect", set field error on `currentPassword`.
  - **Card 3 — Account metadata** (read-only): email, user type, role (resolved name if available via session), member since (`createdAt` formatted).
- **Session sync:** after a successful profile save, call the parent ability/session context to re-read `/api/auth/me` so the Topbar reflects new name/image.

### 3.3 Navigation entry

- Add to the dashboard sidebar (likely in `components/shell/*`) under an existing "Administration" or similar group:
  - **System Settings** → `/settings` — visible when `ability.can('read', 'Setting')`.
  - **My Account** → `/settings/account` — always visible when signed in.
- Both should also be registered as Command Palette entries in `components/shell/CommandPalette.tsx`.

---

## 4. CASL wiring

### 4.1 Subject

`Setting` is already declared in `Subjects` in `lib/acl/ability.ts`. **No change required.**

### 4.2 Actions used

| Where                              | Action   | Subject   |
| ---------------------------------- | -------- | --------- |
| `GET /api/settings`                | `read`   | `Setting` |
| `GET /api/settings/[key]`          | `read`   | `Setting` |
| `PUT /api/settings/[key]`          | `update` | `Setting` |
| `DELETE /api/settings/[key]`       | `delete` | `Setting` |
| `/api/account` (GET/PATCH)         | — (self) | —         |
| `/settings` page guard             | `read`   | `Setting` |
| `/settings/account` page guard     | — (self) | —         |

### 4.3 Permission matrix

`lib/acl/permissions-map.ts` already lists `settings` with `['view', 'edit']`. Those map via `actionMap` to CASL `read` and `update`. Interpretation for non-superadmin roles:

- `view` granted → can list + get settings, can open `/settings`.
- `edit` granted → can upsert (PUT) via the key editor.
- `delete` on `Setting` is **only** available to superadmins (who have `manage all`). If product wants delete to be a discrete role permission, `permissions-map.ts` must add `'delete'` to the `settings` actions list and `actionMap` already covers it — flag this as an **open question** rather than assuming.

### 4.4 No new subjects, no new actions

Do not add new entries to `Subjects` or `Actions`. Do not touch `moduleToSubject` / `actionMap`.

---

## 5. Downstream task checklist

### db-schema-builder
- [x] `settings` table — **already exists**, skip.
- [ ] No migrations needed.

### api-route-builder
- [ ] Create `app/api/settings/route.ts` with `GET` (list).
- [ ] Create `app/api/settings/[key]/route.ts` with `GET`, `PUT`, `DELETE`.
- [ ] Create `app/api/account/route.ts` with `GET`, `PATCH`.
- [ ] Reuse `getSessionUser`, `defineAbilityFor`, `verifyPassword`, and the existing password hash helper from `lib/auth/*`.
- [ ] All handlers return the canonical `{ data }` / `{ error: { message, code } }` envelope.

### ui-dashboard-builder
- [ ] `app/(dashboard)/settings/page.tsx` — list + sheet editor + delete dialog.
- [ ] `app/(dashboard)/settings/account/page.tsx` — profile + password + metadata cards.
- [ ] Sidebar and Command Palette entries for both routes.
- [ ] Use `components/data-table/DataTable.tsx`, `components/ui/sheet`, `components/ui/alert-dialog`, `components/ui/form`, `sonner`.

### casl-wiring
- [x] `Setting` subject — already present.
- [x] Permission map entry — already present.
- [ ] Verify UI hides delete action when `!can('delete', 'Setting')`.
- [ ] Open question to confirm with product: expose `delete` as a role-level permission in `permissions-map.ts`?

---

## 6. Self-verification checklist

- [x] All tables have `id`, `createdAt`, `updatedAt`; `deletedAt` present (soft delete supported).
- [x] SQLite + `drizzle-orm/sqlite-core` only — no pg-core.
- [x] Session access via `getSessionUser()` / `getSession()`; session shape unchanged.
- [x] CASL subject `Setting` already exists; no new subjects invented.
- [x] Response envelope documented; error codes enumerated.
- [x] All list UI specified to use `components/data-table/DataTable.tsx` with correct props.
- [x] Create/edit flows use right-side Sheet with RHF + Zod + sonner.
- [x] No source code in this spec — only shapes, field names, validations.
- [x] `/api/account` cannot be used to change role, status, userType, email, or another user's data.
- [x] Existing schema mirrored, DB-layer tasks marked skip.
