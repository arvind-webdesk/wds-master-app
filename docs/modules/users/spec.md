# Module Spec: `users`

> Written by the `module-architect` agent. Consumed by `db-schema-builder`,
> `api-route-builder`, `ui-dashboard-builder`, and `casl-wiring`.
> **No source code in this file — types, shapes, and behaviours only.**

## 1. Overview
- **Purpose**: Manage admin/staff user accounts: list users in a paginated table, create new users via a right-side Sheet, view a detail page split into `Account` and `Activity` tabs, edit profile/role/status, soft-delete, and toggle active/inactive status. Consumed by admins and superadmins only.
- **Module slug**: `users`
- **CASL Subject**: `User` (already registered in `lib/acl/ability.ts`)
- **Sidebar entry?** yes
- **Read-only?** no

## 2. Data model — `lib/db/schema/users.ts`

> **Schema already exists — DO NOT redesign. `db-schema-builder` must mark DB-layer tasks as "already exists, skip".** The table below mirrors the existing file exactly.

| Column (TS)          | DB name                 | Drizzle type                                                     | Constraints                                         | Notes                                               |
|----------------------|-------------------------|------------------------------------------------------------------|-----------------------------------------------------|-----------------------------------------------------|
| `id`                 | `id`                    | `integer('id').primaryKey({ autoIncrement: true })`              | PK                                                  | always                                              |
| `firstName`          | `first_name`            | `text('first_name')`                                             | notNull                                             | display name                                        |
| `lastName`           | `last_name`             | `text('last_name')`                                              | notNull                                             | display name                                        |
| `email`              | `email`                 | `text('email')`                                                  | notNull, unique                                     | login identifier; stored lowercased                 |
| `contactNo`          | `contact_no`            | `text('contact_no')`                                             | nullable                                            | free-form phone string                              |
| `image`              | `image`                 | `text('image')`                                                  | nullable                                            | avatar URL / path                                   |
| `status`             | `status`                | `text('status').default('active')`                               | notNull                                             | enum string: `'active' \| 'inactive'`               |
| `userType`           | `user_type`             | `text('user_type').default('admin')`                             | notNull                                             | enum string: `'superadmin' \| 'admin' \| 'user'`    |
| `roleId`             | `role_id`               | `integer('role_id').references(() => roles.id, { onDelete: 'set null' })` | nullable FK                                | role reference                                      |
| `password`           | `password`              | `text('password')`                                               | notNull                                             | **bcrypt hash only** — never returned in API output |
| `portal`             | `portal`                | `text('portal')`                                                 | nullable                                            | which portal the user belongs to                    |
| `resetPasswordToken` | `reset_password_token`  | `text('reset_password_token')`                                   | nullable                                            | never returned in API output                        |
| `createdAt`          | `created_at`            | `text('created_at').default(sql\`(CURRENT_TIMESTAMP)\`).notNull()` |                                                   | always                                              |
| `updatedAt`          | `updated_at`            | `text('updated_at').default(sql\`(CURRENT_TIMESTAMP)\`).notNull()` |                                                   | always; route handlers must bump on PATCH           |
| `deletedAt`          | `deleted_at`            | `text('deleted_at')`                                             | nullable                                            | soft-delete                                         |

**Indexes** (already present):
- `users_email_idx` on `email`
- `users_role_id_idx` on `role_id`
- `users_deleted_at_idx` on `deleted_at`

**Relations** (ensure in `lib/db/relations.ts`):
- `users.roleId` → `roles.id` (many users belong to one role)
- Back-ref on `roles`: `users: many(users)`

**Types exported from schema file** (already present):
- `User    = typeof users.$inferSelect`
- `NewUser = typeof users.$inferInsert`
- `SafeUser = Omit<User, 'password' | 'resetPasswordToken'>` — **API routes MUST return `SafeUser`, never `User`.**

## 3. API surface

Response shape (enforced):
- Success: `{ data: T, meta?: { total, page, limit } }`
- Error:   `{ error: { message: string, code: ErrorCode } }`
- Codes: `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`

All routes:
1. Call `getSessionUser()`; if null → 401 `UNAUTHORIZED`.
2. Build `defineAbilityFor(user)`; if CASL check fails → 403 `FORBIDDEN`.
3. Never return `password` or `resetPasswordToken` — project over `SafeUser` columns.
4. List/get: filter `isNull(users.deletedAt)`.

| Method | Path                             | CASL check                       | Zod body/query                                                                                                                | Success returns                                        | Status |
|--------|----------------------------------|----------------------------------|-------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------|--------|
| GET    | `/api/users`                     | `can('read', 'User')`            | query: `page?=1, limit?=20 (max 100), search?=string, status?='active'\|'inactive', roleId?=number, userType?=enum, sort?=string, order?='asc'\|'desc'` | `{ data: SafeUser[], meta: { total, page, limit } }`   | 200    |
| POST   | `/api/users`                     | `can('create', 'User')`          | `{ firstName, lastName, email, password, contactNo?, image?, status?='active', userType?='admin', roleId?=number, portal? }`  | `{ data: SafeUser }`                                   | 201    |
| GET    | `/api/users/[id]`                | `can('read', 'User')`            | —                                                                                                                             | `{ data: SafeUser & { role?: { id, name } \| null } }` | 200    |
| PATCH  | `/api/users/[id]`                | `can('update', 'User')`          | partial of POST body **minus `password`** (password change is out-of-scope of this module)                                    | `{ data: SafeUser }`                                   | 200    |
| DELETE | `/api/users/[id]`                | `can('delete', 'User')`          | —                                                                                                                             | `{ data: { id } }` (soft-delete: set `deletedAt = CURRENT_TIMESTAMP`) | 200    |
| POST   | `/api/users/[id]/activate`       | `can('activate', 'User')`        | `{ status: 'active' \| 'inactive' }`                                                                                          | `{ data: SafeUser }` (toggle sets `status`, bumps `updatedAt`)       | 200    |

### 3.1 Zod rules (create)
- `firstName`: `z.string().trim().min(1).max(80)`
- `lastName`:  `z.string().trim().min(1).max(80)`
- `email`:     `z.string().trim().toLowerCase().email().max(254)` — **CONFLICT (409)** if email exists on a non-deleted row.
- `password`:  `z.string().min(8).max(128)` — hashed via `hashPassword()` before insert; never echoed back.
- `contactNo`: `z.string().trim().max(40).optional().nullable()`
- `image`:     `z.string().url().max(500).optional().nullable()`
- `status`:    `z.enum(['active','inactive']).default('active')`
- `userType`:  `z.enum(['superadmin','admin','user']).default('admin')` — **only a caller with `userType === 'superadmin'` may create another `superadmin`**, else 403.
- `roleId`:    `z.number().int().positive().optional().nullable()` — validated to exist in `roles` table; else 422.
- `portal`:    `z.string().trim().max(60).optional().nullable()`

### 3.2 Zod rules (update / activate)
- All create fields except `password` become optional.
- `email` change: recheck uniqueness (CONFLICT 409 if taken by another non-deleted user).
- `activate` body: `z.object({ status: z.enum(['active','inactive']) })`.

### 3.3 Edge behaviours
- A user **cannot delete or deactivate themselves**: if `params.id === session.user.id` on DELETE or activate→`inactive`, return 422 `VALIDATION_ERROR` with message "You cannot modify your own account status".
- A non-superadmin cannot elevate anyone to `superadmin` (422 / 403).
- Listing defaults exclude soft-deleted rows; no `includeDeleted` flag in this spec.

Pagination defaults: `page=1, limit=20` (max 100). Soft-delete filter: `isNull(deletedAt)`. Default sort: `createdAt desc`. Search is case-insensitive `LIKE` across `firstName`, `lastName`, `email`.

## 4. UI surface

### 4.1 List page — `app/(dashboard)/users/page.tsx`

Uses `components/data-table/DataTable.tsx`. Server component may fetch initial page; interactions use client component wrapper calling `/api/users`.

- **Columns** (left to right):
  | Header    | tanstack id  | Sortable | Notes                                                       |
  |-----------|--------------|----------|-------------------------------------------------------------|
  | Name      | `name`       | yes      | `firstName + ' ' + lastName` with avatar (image) on the left |
  | Email     | `email`      | yes      | plain text                                                  |
  | Role      | `role`       | no       | role.name badge, `—` if null                                |
  | User Type | `userType`   | yes      | capitalized badge                                           |
  | Status    | `status`     | yes      | green `Active` / muted `Inactive` badge                     |
  | Created   | `createdAt`  | yes      | localized date                                              |
  | Actions   | `actions`    | no       | row menu (see below)                                        |
- **Toolbar**:
  - Debounced search input (300ms) → `?search=`
  - Filter chips: `Status` (`All / Active / Inactive`), `User Type` (`All / Superadmin / Admin / User`), `Role` (select of roles)
  - `Clear all` link when any filter active
  - Right-aligned primary button: `New user` (guarded by `can('create','User')`)
- **Row actions** (dropdown, each guarded by CASL):
  - `Edit` (`update`) → opens edit Sheet
  - `Activate` / `Deactivate` (`activate`) → confirm dialog → `POST /api/users/[id]/activate`
  - `Delete` (`delete`) → confirm dialog → `DELETE /api/users/[id]` → sonner toast + table refresh
  - Self-row: hide `Delete` and `Deactivate`.
- **Create**: right-side `<Sheet>` (Framer Motion slide) with RHF + Zod → `POST /api/users` → sonner success toast, close Sheet, refresh table.
- **Empty state**: "No users yet" + primary CTA `New user` (hidden if caller lacks `create`).
- **Loading**: DataTable `isLoading` skeletons.
- **URL-synced state**: `?page`, `?limit`, `?search`, `?status`, `?roleId`, `?userType`, `?sort`, `?order` via `useSearchParams` + `router.replace`.

### 4.2 Detail page — `app/(dashboard)/users/[id]/page.tsx`

- **Header card**: avatar, full name, email, status badge, user-type badge, role badge. Primary actions: `Edit` (opens edit Sheet), `Activate/Deactivate` toggle button, `Delete` (destructive). All actions guarded by CASL + self-mutation rules.
- **Tabs** (URL-synced via `?tab=account|activity`, default `account`):
  - **Account** — read-only summary grid of profile fields (first/last name, email, contact no, role, user type, status, portal, created/updated timestamps). `Edit` button opens the same Sheet as the list page in edit mode.
  - **Activity** — chronological list of `activity_logs` rows where `userId = params.id`. Paginated (20/page) via `GET /api/activity-logs?userId=<id>` (existing module). Each row: timestamp, action label, target, IP if present. Empty state: "No activity recorded for this user yet."
- **Forms**: RHF + Zod, `useTransition` for mutations, sonner toast on success/failure, field-level error rendering from `{ error: { code: 'VALIDATION_ERROR' } }` responses.
- **Not found**: if `GET /api/users/[id]` returns 404 → Next.js `notFound()`.

### 4.3 Sheet fields (Create / Edit) — `components/users/users-sheet.tsx`

Same Sheet component drives both modes; `mode: 'create' | 'edit'` prop switches submit handler and hides `password` in edit.

| Field        | Input control                                             | Zod validation                                                   | Required      |
|--------------|-----------------------------------------------------------|------------------------------------------------------------------|---------------|
| `firstName`  | `Input`                                                   | `z.string().trim().min(1).max(80)`                               | yes           |
| `lastName`   | `Input`                                                   | `z.string().trim().min(1).max(80)`                               | yes           |
| `email`      | `Input` type=email                                        | `z.string().trim().toLowerCase().email().max(254)`               | yes           |
| `password`   | `Input` type=password (create only, hidden in edit mode)  | `z.string().min(8).max(128)`                                     | yes (create)  |
| `contactNo`  | `Input` type=tel                                          | `z.string().trim().max(40).optional()`                           | no            |
| `image`      | `Input` type=url                                          | `z.string().url().max(500).optional()`                           | no            |
| `userType`   | `Select` (`Superadmin` / `Admin` / `User`)                | `z.enum(['superadmin','admin','user'])`                          | yes (default `admin`); `Superadmin` option disabled for non-superadmin callers |
| `roleId`     | `Select` of roles (fetched from `/api/roles`)             | `z.number().int().positive().optional().nullable()`              | no            |
| `status`     | `Select` (`Active` / `Inactive`)                          | `z.enum(['active','inactive'])`                                  | yes (default `active`) |
| `portal`     | `Input`                                                   | `z.string().trim().max(60).optional()`                           | no            |

- Submit: `create` → `POST /api/users`; `edit` → `PATCH /api/users/[id]` with only changed fields.
- On 409 CONFLICT: set field error on `email`.
- On 422 VALIDATION_ERROR: map to field if message is field-scoped, else top-of-form alert.
- Close behaviour: dismiss confirms only if form is dirty.

## 5. CASL wiring

- **Subject**: `User` — already present in the `Subjects` union in `lib/acl/ability.ts`. **Do not re-add.**
- **Actions used by this module**: `'read'`, `'create'`, `'update'`, `'delete'`, `'activate'`.
- **Permissions map** (`lib/acl/permissions-map.ts`): the `users` entry already lists `['view','add','edit','delete']`. **Add `'activate'`** to that entry's `actions` array so it appears in the Roles permission matrix:
  ```
  { key: 'users', label: 'Users', actions: ['view', 'add', 'edit', 'delete', 'activate'] }
  ```
  Also extend `PermissionAction` union to include `'activate'`.
- **Action map** (`actionMap` in `lib/acl/ability.ts`): add `activate: 'activate'` to the DB→CASL map so role permissions seeded with `action='activate'` resolve correctly.
- **Seed** (`scripts/seed.ts`): for the `superadmin` role, ensure `role_permissions` rows exist for every `(users, action)` pair including the new `activate`. Superadmin also gets `manage all` at runtime, but DB rows should still be complete for matrix UI correctness.
- **Self-protection** (enforced in route handlers, not CASL): callers cannot delete/deactivate themselves (see §3.3).

## 6. Sidebar entry

- **Label**: `Users`
- **Icon**: `Users` from `lucide-react`
- **Href**: `/users`
- **Order**: directly under `Dashboard`, above `Roles`
- **Visibility**: render only if `can('read', 'User')`.

## 7. File checklist

- [x] `lib/db/schema/users.ts` — **already exists, skip**
- [ ] `lib/db/relations.ts` — ensure `users ↔ roles` relation + `users.activityLogs` back-ref (if activity-logs relations file expects it)
- [ ] `lib/db/index.ts` — confirm barrel export of `users`
- [ ] `app/api/users/route.ts` — GET (list), POST (create)
- [ ] `app/api/users/[id]/route.ts` — GET, PATCH, DELETE (soft)
- [ ] `app/api/users/[id]/activate/route.ts` — POST (toggle status)
- [ ] `app/(dashboard)/users/page.tsx` — list page
- [ ] `app/(dashboard)/users/[id]/page.tsx` — detail page with Account/Activity tabs
- [ ] `components/users/users-sheet.tsx` — create/edit Sheet (RHF + Zod)
- [ ] `components/users/users-columns.tsx` — TanStack column defs
- [ ] `components/users/users-row-actions.tsx` — row dropdown menu
- [ ] `lib/acl/ability.ts` — extend `actionMap` with `activate`
- [ ] `lib/acl/permissions-map.ts` — add `activate` to `users` entry + widen `PermissionAction`
- [ ] `scripts/seed.ts` — ensure superadmin has `users.activate` role-permission
- [ ] `components/shell/Sidebar.tsx` — add `Users` nav link (guarded by `read User`)
