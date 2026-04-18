# Module Spec: `<slug>`

> Written by the `module-architect` agent. Consumed by `db-schema-builder`,
> `api-route-builder`, `ui-dashboard-builder`, and `casl-wiring`.
> **No source code in this file — types, shapes, and behaviours only.**

## 1. Overview
- **Purpose**: one-paragraph summary of what this module does and who uses it.
- **Module slug**: `<slug>` (kebab-case, matches URL path)
- **CASL Subject**: `<Subject>` (PascalCase, e.g. `User`, `EmailTemplate`)
- **Sidebar entry?** yes / no
- **Read-only?** yes / no (if yes, skip mutation API routes)

## 2. Data model — `lib/db/schema/<slug>.ts`

| Column (TS)  | DB name        | Drizzle type                                                   | Constraints          | Notes               |
|--------------|----------------|----------------------------------------------------------------|----------------------|---------------------|
| `id`         | `id`           | `integer('id').primaryKey({ autoIncrement: true })`            | PK                   | always              |
| `<field>`    | `<snake_case>` | `text(...)` / `integer(...)` / `integer(..., { mode: 'boolean' })` | notNull? unique?   | spec-specific       |
| `createdAt`  | `created_at`   | `text(...).default(sql\`(CURRENT_TIMESTAMP)\`).notNull()`      |                      | always              |
| `updatedAt`  | `updated_at`   | `text(...).default(sql\`(CURRENT_TIMESTAMP)\`).notNull()`      |                      | always              |
| `deletedAt`  | `deleted_at`   | `text(...)`                                                    | nullable             | soft-delete         |

**Indexes**: `<slug>_<col>_idx` on frequently-filtered columns.
**Relations**: describe FKs + back-refs for `lib/db/relations.ts`.
**Types to export**: `type X = typeof x.$inferSelect` + `type NewX = typeof x.$inferInsert`.

## 3. API surface

Response shape (enforced):
- Success: `{ data: T, meta?: { total, page, limit } }`
- Error:   `{ error: { message: string, code: ErrorCode } }`
- Codes: `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`

| Method | Path                         | CASL check                            | Zod body/query                                     | Success returns                          |
|--------|------------------------------|---------------------------------------|----------------------------------------------------|------------------------------------------|
| GET    | `/api/<slug>`                | `can('read', '<Subject>')`            | `?page, limit, search, <filters>`                  | `{ data: T[], meta: { total, page, limit } }` |
| POST   | `/api/<slug>`                | `can('create', '<Subject>')`          | `{ ...fields }`                                    | `{ data: T }` (201)                      |
| GET    | `/api/<slug>/[id]`           | `can('read', '<Subject>')`            | —                                                  | `{ data: T }`                            |
| PATCH  | `/api/<slug>/[id]`           | `can('update', '<Subject>')`          | `{ ...partialFields }`                             | `{ data: T }`                            |
| DELETE | `/api/<slug>/[id]`           | `can('delete', '<Subject>')`          | —                                                  | `{ data: { id } }` (soft delete)         |

Pagination defaults: `page=1, limit=20` (max 100). Soft-delete filter: `isNull(deletedAt)`.

## 4. UI surface

### 4.1 List page — `app/(dashboard)/<slug>/page.tsx`
- **Columns** (left to right): `<column name>` (`<tanstack id>`, sortable? filterable?)
- **Toolbar**: search input, filter chips (`<chip name>`), clear-all
- **Row actions**: Edit · Delete · (module-specific)
- **Create**: right-side `<Sheet>` with RHF + Zod form → `POST /api/<slug>` → sonner toast → refresh
- **Empty state**: "No <things> yet" + primary CTA

### 4.2 Detail page (if needed) — `app/(dashboard)/<slug>/[id]/page.tsx`
- **Header card**: name/title + status + primary actions
- **Tabs** (URL-synced via `?tab=`): `<tab1>` · `<tab2>` · ...
- **Forms**: RHF + Zod, `useTransition` for mutations, sonner toast on success

### 4.3 Sheet fields (Create / Edit)
| Field | Type                | Zod validation                                | Required |
|-------|---------------------|-----------------------------------------------|----------|
| `<name>` | `Input` / `Select` / `Textarea` / `Checkbox` | `z.string().min(1)` / `z.enum(...)` / ... | yes/no |

## 5. CASL wiring

- **Subject**: `<Subject>`
- **Actions**: `'read'`, `'create'`, `'update'`, `'delete'` (plus module-specific: `'activate'`, `'send'`, `'export'`)
- **Permissions map entry** (in `lib/acl/permissions-map.ts`):
  ```ts
  { key: '<slug>', label: '<Human Label>', actions: ['view','add','edit','delete'] }
  ```
- **Seed**: for the `superadmin` role, insert role_permissions rows for every action.

## 6. Sidebar entry (if applicable)
- Label, `lucide-react` icon name, href `/  <slug>`, order position.

## 7. File checklist
- [ ] `lib/db/schema/<slug>.ts` (already exists? mark ✓)
- [ ] `lib/db/relations.ts` — add relations
- [ ] `lib/db/index.ts` — add barrel export
- [ ] `app/api/<slug>/route.ts` — GET, POST
- [ ] `app/api/<slug>/[id]/route.ts` — GET, PATCH, DELETE
- [ ] `app/(dashboard)/<slug>/page.tsx` — list
- [ ] `app/(dashboard)/<slug>/[id]/page.tsx` — detail (if needed)
- [ ] `components/<slug>/<slug>-sheet.tsx` — create/edit sheet
- [ ] `components/<slug>/<slug>-columns.tsx` — TanStack columns
- [ ] `lib/acl/ability.ts` — add subject
- [ ] `lib/acl/permissions-map.ts` — add entry
- [ ] `scripts/seed.ts` — add role_permissions patch
- [ ] `components/shell/Sidebar.tsx` — add nav link (if in sidebar)
