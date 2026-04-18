# Module Spec: `roles`

> Written by the `module-architect` agent. Consumed by `db-schema-builder`,
> `api-route-builder`, `ui-dashboard-builder`, and `casl-wiring`.
> **No source code in this file — types, shapes, and behaviours only.**

## 1. Overview

- **Purpose**: RBAC roles administration. Admins can create, edit and delete roles, and assign a permission matrix (module × action) to each role. Roles are referenced by `users.roleId`; their row in `role_permissions` drives CASL abilities at login (`app/api/auth/login/route.ts`).
- **Module slug**: `roles` (URL path `/roles`, API path `/api/roles`)
- **CASL Subject**: `Role` (already declared in `lib/acl/ability.ts`)
- **Sidebar entry?** yes (under the administration group)
- **Read-only?** no

## 2. Data model

Three tables are involved. **All three already exist** in `lib/db/schema/` and must be mirrored — not re-defined.

### 2.1 `lib/db/schema/roles.ts` — **already exists, do not modify**

| Column (TS)   | DB name       | Drizzle type                                              | Constraints              | Notes                 |
|---------------|---------------|-----------------------------------------------------------|--------------------------|-----------------------|
| `id`          | `id`          | `integer('id').primaryKey({ autoIncrement: true })`       | PK                       |                       |
| `name`        | `name`        | `text('name')`                                            | notNull, unique          | display name          |
| `description` | `description` | `text('description')`                                     | nullable                 | long text allowed     |
| `createdAt`   | `created_at`  | `text(...).default(sql\`(CURRENT_TIMESTAMP)\`).notNull()` |                          |                       |
| `updatedAt`   | `updated_at`  | `text(...).default(sql\`(CURRENT_TIMESTAMP)\`).notNull()` |                          | bump on PATCH         |
| `deletedAt`   | `deleted_at`  | `text('deleted_at')`                                      | nullable                 | soft-delete           |

Index: `roles_name_idx` on `name`.
Exports: `Role = typeof roles.$inferSelect`, `NewRole = typeof roles.$inferInsert`.

### 2.2 `lib/db/schema/permissions.ts` — **already exists, do not modify**

| Column (TS)  | DB name      | Drizzle type                                              | Constraints                                          | Notes                                |
|--------------|--------------|-----------------------------------------------------------|------------------------------------------------------|--------------------------------------|
| `id`         | `id`         | `integer('id').primaryKey({ autoIncrement: true })`       | PK                                                   |                                      |
| `name`       | `name`       | `text('name')`                                            | notNull                                              | module key (e.g. `users`, `roles`)   |
| `action`     | `action`     | `text('action')`                                          | notNull                                              | `view` \| `add` \| `edit` \| `delete` \| `activate` |
| `module`     | `module`     | `text('module')`                                          | notNull                                              | human label / group                  |
| `createdAt`  | `created_at` | `text(...).default(sql\`(CURRENT_TIMESTAMP)\`).notNull()` |                                                      |                                      |
| `updatedAt`  | `updated_at` | `text(...).default(sql\`(CURRENT_TIMESTAMP)\`).notNull()` |                                                      |                                      |

Unique: `permissions_name_action_unq` on (`name`, `action`).
Indexes: `permissions_name_idx` on `name`, `permissions_module_idx` on `module`.
Exports: `Permission`, `NewPermission`.

### 2.3 `lib/db/schema/role-permissions.ts` — **already exists, do not modify**

| Column (TS)     | DB name         | Drizzle type                                                                                | Constraints                      |
|-----------------|-----------------|---------------------------------------------------------------------------------------------|----------------------------------|
| `id`            | `id`            | `integer('id').primaryKey({ autoIncrement: true })`                                         | PK                               |
| `roleId`        | `role_id`       | `integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' })`          | notNull, FK → `roles.id`         |
| `permissionId`  | `permission_id` | `integer('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' })` | notNull, FK → `permissions.id`   |
| `createdAt`     | `created_at`    | `text(...).default(sql\`(CURRENT_TIMESTAMP)\`).notNull()`                                   |                                  |

Unique: `role_permissions_unq` on (`role_id`, `permission_id`).
Indexes: `role_permissions_role_id_idx`, `role_permissions_permission_id_idx`.
Exports: `RolePermission`, `NewRolePermission`.

### 2.4 Relations — `lib/db/relations.ts`

- `roles` → has many `rolePermissions` (via `rolePermissions.roleId`); has many `users` (via `users.roleId`).
- `permissions` → has many `rolePermissions` (via `rolePermissions.permissionId`).
- `rolePermissions` → belongs to `roles` (via `roleId`); belongs to `permissions` (via `permissionId`).

### 2.5 Derived / response types (not a table)

- `RoleWithCounts = Role & { userCount: number, permissionCount: number }` — used by list endpoint.
- `RolePermissionMatrix = { roleId: number, permissions: Array<{ module: string, action: string }> }` — used by the matrix GET endpoint. The `module`/`action` pair is what `login/route.ts` already selects and what CASL consumes.

## 3. API surface

Response shape (enforced, must match `app/api/auth/login/route.ts`):
- Success: `{ data: T, meta?: { total, page, limit } }`
- Error:   `{ error: { message: string, code: ErrorCode } }`
- Codes:   `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`

Every route must:
1. Call `getSessionUser()`; if missing → `401 UNAUTHORIZED`.
2. Build ability via `defineAbilityFor(user)`; if the CASL check fails → `403 FORBIDDEN`.
3. Filter by `isNull(roles.deletedAt)` on all reads.

| # | Method | Path                              | CASL check                      | Zod body / query                                                                                   | Success returns                                     | Status |
|---|--------|-----------------------------------|---------------------------------|----------------------------------------------------------------------------------------------------|-----------------------------------------------------|--------|
| 1 | GET    | `/api/roles`                      | `can('read', 'Role')`           | Query: `page?` (int ≥1, default 1), `limit?` (int 1–100, default 20), `search?` (string, matches `name` or `description` via `LIKE %q%`), `sort?` (`name` \| `createdAt`, default `name`), `order?` (`asc` \| `desc`, default `asc`) | `{ data: RoleWithCounts[], meta: { total, page, limit } }` | 200    |
| 2 | POST   | `/api/roles`                      | `can('create', 'Role')`         | Body: `{ name: string(1..64), description?: string(0..500) }`. On duplicate `name` → `409 CONFLICT`. | `{ data: Role }`                                    | 201    |
| 3 | GET    | `/api/roles/[id]`                 | `can('read', 'Role')`           | —                                                                                                  | `{ data: RoleWithCounts }`                          | 200    |
| 4 | PATCH  | `/api/roles/[id]`                 | `can('update', 'Role')`         | Body: `{ name?: string(1..64), description?: string(0..500) \| null }`. Bump `updatedAt`.           | `{ data: Role }`                                    | 200    |
| 5 | DELETE | `/api/roles/[id]`                 | `can('delete', 'Role')`         | —. Soft delete (set `deletedAt = CURRENT_TIMESTAMP`). Refuse with `409 CONFLICT` if any non-deleted `users.roleId` still references this role. | `{ data: { id } }`                                  | 200    |
| 6 | GET    | `/api/roles/[id]/permissions`     | `can('read', 'Role')`           | —                                                                                                  | `{ data: { roleId, permissions: Array<{ id, name, action, module, enabled: boolean }> } }` — `enabled` is true when a `role_permissions` row exists for that `(roleId, permissionId)`. The response MUST include every `(module, action)` pair from `PERMISSION_MODULES` in `lib/acl/permissions-map.ts`, even if the `permissions` row doesn't yet exist (in which case `id` is `null`). | 200    |
| 7 | PUT    | `/api/roles/[id]/permissions`     | `can('update', 'Role')`         | Body: `{ permissions: Array<{ name: string, action: string }> }`. Each pair must exist in `PERMISSION_MODULES` (otherwise `422 VALIDATION_ERROR`). Server replaces the full set in a single transaction: delete all `role_permissions` rows for `roleId`, then insert one row per submitted pair after upserting any missing `permissions` rows. | `{ data: { roleId, count } }`                       | 200    |

Pagination defaults: `page=1`, `limit=20` (max 100). Soft-delete filter: `isNull(roles.deletedAt)`.
Invalid JSON body → `422 VALIDATION_ERROR` with `Invalid JSON body` (match login route).
`roleId` path parameter must be a positive integer; otherwise `404 NOT_FOUND`.

### 3.1 Implementation notes for route builder

- `userCount` = `count(users.id) where users.roleId = roles.id and users.deletedAt is null`. Compute via left join + group by for the list, or a correlated subquery.
- `permissionCount` = `count(role_permissions.id) where role_permissions.roleId = roles.id`.
- The matrix PUT handler MUST NOT return until the transaction commits. If the user has an in-flight session with the modified role, permissions are only refreshed on their next login (same behaviour as `app/api/auth/login/route.ts`) — this is acceptable and should be documented inline.
- Deleting the `superadmin` role is always forbidden (`409 CONFLICT`, message `Cannot delete the superadmin role`).

## 4. UI surface

### 4.1 List page — `app/(dashboard)/roles/page.tsx`

- Uses `components/data-table/DataTable.tsx` exactly as-is (columns/data/total/page/limit/onPageChange/onLimitChange/onSortChange/toolbar/isLoading/emptyMessage props).
- Data fetch: client component, `fetch('/api/roles?...')` with URL-synced state (`page`, `limit`, `search`, `sort`, `order`) using `useSearchParams` + `router.replace`.
- **Columns** (left → right):
  | ID               | Header        | Accessor / source               | Sortable | Visible by default |
  |------------------|---------------|---------------------------------|----------|--------------------|
  | `name`           | Name          | `row.name`                      | yes      | yes                |
  | `description`    | Description   | `row.description` (truncate 80) | no       | yes                |
  | `userCount`      | Users         | `row.userCount` (badge)         | no       | yes                |
  | `permissionCount`| Permissions   | `row.permissionCount` (badge)   | no       | yes                |
  | `createdAt`      | Created       | relative time from `row.createdAt` | yes  | no                 |
  | `actions`        | (blank)       | row-action dropdown             | no       | yes                |
- **Toolbar**: search `<Input>` (debounced 300ms) bound to `?search=`; right-aligned primary button `+ New Role` opening the Create Sheet. `Columns` and `Compact` controls come for free from `DataTable`.
- **Row actions** (shadcn `DropdownMenu`):
  - `Edit` → opens the Sheet in edit mode with the row preloaded.
  - `Manage permissions` → `router.push('/roles/' + id)`.
  - `Delete` → opens an `AlertDialog` confirming soft-delete; disabled when `userCount > 0` with tooltip `Reassign users first`; always disabled for the `superadmin` role.
- **CASL guards in the UI** (via `useAbility()` from `lib/acl/ability-context.tsx`):
  - `+ New Role` button hidden unless `can('create', 'Role')`.
  - `Edit` / `Manage permissions` hidden unless `can('update', 'Role')`.
  - `Delete` hidden unless `can('delete', 'Role')`.
- **Empty state**: `emptyMessage="No roles yet"`. When `total === 0` and no search, show an inline CTA card with `+ New Role`.
- **Toasts** via `sonner`: success and error on every mutation.

### 4.2 Permission matrix page — `app/(dashboard)/roles/[id]/page.tsx`

- **Header card**: role `name`, `description`, `userCount` badge, `Edit role` button (opens the Sheet in edit mode) on the right.
- **Body**: a single `MatrixGrid` table rendered from `PERMISSION_MODULES` (`lib/acl/permissions-map.ts`). One row per module, one column per action in the canonical set `['view', 'add', 'edit', 'delete', 'activate']`; a cell is rendered as a `<Checkbox>` only when the module's `actions` array contains that action, otherwise a dashed placeholder.
- **Columns** (left → right): `Module` (label), then one column per action. Sticky header.
- **State**: local `Record<moduleKey, Record<action, boolean>>` seeded from `GET /api/roles/[id]/permissions`. A `Save changes` sticky footer appears when the state diverges from the server snapshot, with `Discard` and `Save`.
- **Bulk toggles**: a `Toggle row` checkbox at the start of each row (select/deselect every available action in that module); a `Toggle column` checkbox at the top of each action column (select/deselect that action across every module that supports it).
- **Save** issues `PUT /api/roles/[id]/permissions` with the flattened `{ name, action }[]` list of enabled cells; on success shows a sonner toast `Permissions updated` and resets the dirty baseline.
- **CASL guards**: all checkboxes are `disabled` unless `can('update', 'Role')`. The `Save` button is hidden when read-only.
- Framer Motion: `Save changes` footer slides up with a height/opacity transition when dirty.

### 4.3 Sheet fields (Create / Edit) — `components/roles/role-sheet.tsx`

Right-side `<Sheet>` (shadcn), RHF + Zod resolver, sonner toasts, framer-motion slide animation only on the Sheet itself (no per-field animation).

| Field         | Control       | Zod validation                                                                 | Required | Placeholder / helper          |
|---------------|---------------|--------------------------------------------------------------------------------|----------|-------------------------------|
| `name`        | `Input`       | `z.string().trim().min(1, 'Name is required').max(64, 'Max 64 characters')`    | yes      | e.g. `Editor`                 |
| `description` | `Textarea`    | `z.string().trim().max(500, 'Max 500 characters').optional()`                  | no       | What can this role do?        |

- Submit: create → `POST /api/roles`; edit → `PATCH /api/roles/[id]`.
- On `409 CONFLICT` (duplicate name) surface a field-level error on `name`.
- On success: close sheet, toast `Role created` / `Role updated`, revalidate the list (router refresh / swr mutate).

### 4.4 TanStack columns — `components/roles/role-columns.tsx`

Exports a `columns: ColumnDef<RoleWithCounts>[]` factory that takes `{ onEdit, onManage, onDelete, can }` handlers. IDs must match the list-page table above.

## 5. CASL wiring

- **Subject**: `Role` — already present in `Subjects` union in `lib/acl/ability.ts`. Do NOT add a duplicate.
- **Actions used**: `read`, `create`, `update`, `delete`. No module-specific actions (`activate` / `send` / `export` are not applicable).
- **DB action ↔ CASL action** (already mapped in `actionMap()` inside `lib/acl/ability.ts`):
  - `view` → `read`
  - `add`  → `create`
  - `edit` → `update`
  - `delete` → `delete`
- **`lib/acl/permissions-map.ts`** — already contains the canonical entry:
  ```
  { key: 'roles', label: 'Roles', actions: ['view', 'add', 'edit', 'delete'] }
  ```
  Do NOT change.
- **Seed** (`scripts/seed.ts`):
  - Ensure the four `permissions` rows exist for `name='roles'` × `action∈{view,add,edit,delete}` (idempotent, via the `permissions_name_action_unq` constraint).
  - Insert `role_permissions` rows mapping the `superadmin` role to all four (note: superadmin also short-circuits via `manage all` in `defineAbilityFor`, but rows should still exist for UI parity).
  - Default `admin` role gets all four.
  - Default `user` role gets none.

## 6. Sidebar entry

- Label: `Roles`
- `lucide-react` icon: `ShieldCheck`
- Href: `/roles`
- Group: `Administration` (below `Users`)
- Visibility: requires `can('read', 'Role')`.

## 7. File checklist

- [x] `lib/db/schema/roles.ts` — **already exists, skip**
- [x] `lib/db/schema/permissions.ts` — **already exists, skip**
- [x] `lib/db/schema/role-permissions.ts` — **already exists, skip**
- [ ] `lib/db/relations.ts` — add `roles` / `permissions` / `rolePermissions` relations (see §2.4) if not already declared
- [ ] `lib/db/index.ts` — ensure barrel exports `roles`, `permissions`, `rolePermissions`
- [ ] `app/api/roles/route.ts` — GET (list, §3 #1), POST (§3 #2)
- [ ] `app/api/roles/[id]/route.ts` — GET (§3 #3), PATCH (§3 #4), DELETE (§3 #5)
- [ ] `app/api/roles/[id]/permissions/route.ts` — GET (§3 #6), PUT (§3 #7)
- [ ] `app/(dashboard)/roles/page.tsx` — list + create sheet trigger (§4.1)
- [ ] `app/(dashboard)/roles/[id]/page.tsx` — permission matrix (§4.2)
- [ ] `components/roles/role-sheet.tsx` — create/edit Sheet (§4.3)
- [ ] `components/roles/role-columns.tsx` — TanStack columns (§4.4)
- [ ] `components/roles/permission-matrix.tsx` — matrix grid used by [id] page
- [x] `lib/acl/ability.ts` — **`Role` subject already declared, skip**
- [x] `lib/acl/permissions-map.ts` — **`roles` entry already present, skip**
- [ ] `scripts/seed.ts` — ensure role_permissions seeds (§5)
- [ ] `components/shell/Sidebar.tsx` — add `Roles` nav link (§6)

## 8. Self-verification checklist

- [x] All tables keep `id`, `createdAt`, `updatedAt` (roles also has `deletedAt`; permissions/role_permissions intentionally do not).
- [x] Reuses existing `Role` subject (no duplicate invention).
- [x] Existing schema files mirrored exactly, marked "already exists, skip".
- [x] Response shape `{ data, meta? }` / `{ error: { message, code } }` with the documented code set.
- [x] UI list page uses `components/data-table/DataTable.tsx` with its documented props.
- [x] Sheet uses RHF + Zod + sonner; framer-motion limited to Sheet and the save-footer slide.
- [x] CASL checks specified for every route and every gated UI element.
- [x] No source code in this file — types, shapes, validation rules only.
