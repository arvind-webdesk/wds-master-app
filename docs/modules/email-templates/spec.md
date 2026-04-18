# Module Spec: Email Templates

> Single source of truth for db-schema-builder, api-route-builder, ui-dashboard-builder, and casl-wiring.
> Do not edit downstream artifacts without updating this spec first.

- **Slug**: `email-templates`
- **CASL Subject**: `EmailTemplate` (already declared in `lib/acl/ability.ts`)
- **Permission module key**: `email-templates` (already in `lib/acl/permissions-map.ts`)
- **Default actions**: `view`, `add`, `edit`, `delete`, `send`
- **Mode**: build
- **One-line description**: Email template editor (subject, body HTML, phrases) with list, create Sheet, and full editor page; supports sending a test email.

---

## 1. Data Model

### 1.1 `email_templates` (parent)

> Already exists at `lib/db/schema/email-templates.ts`. **Mirror columns exactly. DB-layer task: skip — already exists.**

| Column        | Type                              | Constraints / Default                          | Notes |
|---------------|-----------------------------------|------------------------------------------------|-------|
| `id`          | `integer`                         | PK, autoIncrement                              |       |
| `title`       | `text('title')`                   | not null                                       | Human-readable name |
| `code`        | `text('code')`                    | not null, **unique**, indexed (`email_templates_code_idx`) | Stable identifier used by code that triggers emails (e.g. `password-reset`) |
| `subject`     | `text('subject')`                 | not null                                       | Email subject line; may contain `{{phrase}}` tokens |
| `body`        | `text('body')`                    | not null                                       | HTML body; may contain `{{phrase}}` tokens |
| `status`      | `text('status')`                  | not null, default `'active'`, indexed (`email_templates_status_idx`) | `'active' \| 'inactive'` |
| `allowTo`     | `text('allow_to')`                | nullable                                       | Optional comma-separated allow-list of recipient emails / domains |
| `emailType`   | `text('email_type')`              | nullable                                       | Free-form classification (e.g. `transactional`, `marketing`) |
| `createdAt`   | `text('created_at')`              | not null, default `(CURRENT_TIMESTAMP)`        |       |
| `updatedAt`   | `text('updated_at')`              | not null, default `(CURRENT_TIMESTAMP)`        | Bumped on every update |
| `deletedAt`   | `text('deleted_at')`              | nullable                                       | Soft delete marker |

Indexes: `email_templates_code_idx` on `code`, `email_templates_status_idx` on `status`.

Inferred types: `EmailTemplate` (select), `NewEmailTemplate` (insert).

### 1.2 `email_phrases` (child of `email_templates`)

> Already exists. **Mirror columns exactly. DB-layer task: skip — already exists.**

| Column        | Type                              | Constraints / Default                          | Notes |
|---------------|-----------------------------------|------------------------------------------------|-------|
| `id`          | `integer`                         | PK, autoIncrement                              |       |
| `templateId`  | `integer('template_id')`          | not null, FK → `email_templates.id` `ON DELETE CASCADE`, indexed (`email_phrases_template_id_idx`) | Parent template |
| `key`         | `text('key')`                     | not null                                       | Token name (without `{{ }}`). Conventionally lower-case, dash- or underscore-separated. |
| `value`       | `text('value')`                   | not null                                       | Default substitution value |
| `createdAt`   | `text('created_at')`              | not null, default `(CURRENT_TIMESTAMP)`        |       |
| `updatedAt`   | `text('updated_at')`              | not null, default `(CURRENT_TIMESTAMP)`        |       |

Index: `email_phrases_template_id_idx` on `template_id`.

Note: phrases are **not** soft-deleted; they are owned by the parent template and cascade on delete. Application logic should also enforce uniqueness of `(templateId, key)` at validation time even though there is no DB unique constraint.

Inferred types: `EmailPhrase` (select), `NewEmailPhrase` (insert).

---

## 2. Validation Rules (Zod, server + client)

### 2.1 Template create / update payload

- `title`: string, trimmed, 1–200 chars, required.
- `code`: string, trimmed, 2–100 chars, lower-kebab-case (`/^[a-z0-9]+(-[a-z0-9]+)*$/`), required on create, **immutable** on update (server must ignore or reject changes).
- `subject`: string, trimmed, 1–300 chars, required.
- `body`: string, 1–100_000 chars, required. HTML allowed; sanitization is the renderer's responsibility, not validation.
- `status`: enum `'active' | 'inactive'`, default `'active'`.
- `allowTo`: optional string, max 1000 chars, allow comma-separated emails / wildcard domains (`*@example.com`). Empty string normalized to `null`.
- `emailType`: optional string, max 50 chars. Empty string normalized to `null`.

Conflict rule: `code` must be unique among non-soft-deleted rows. Violation → `409 CONFLICT`.

### 2.2 Phrase create / update payload

- `key`: string, trimmed, 1–100 chars, `/^[a-zA-Z0-9_-]+$/`, required.
- `value`: string, 0–5000 chars, required (empty allowed but field must be present).
- Uniqueness: `(templateId, key)` must be unique. Violation → `409 CONFLICT` with message `Phrase key already exists for this template`.

### 2.3 Send-test payload

- `to`: array of 1–10 valid email addresses, required.
- `overrides`: optional `Record<string, string>` of phrase keys → values; merged on top of template's stored phrases. Unknown keys are allowed and passed through.
- If template `allowTo` is non-empty, every `to` entry must match (exact email or wildcard domain). Violation → `403 FORBIDDEN` with code `FORBIDDEN` and message `Recipient not allowed by template allow_to`.

---

## 3. API Routes

All routes return `{ data, meta? }` on success or `{ error: { message, code } }` on failure.
Error codes: `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`.
All routes require an authenticated session via `getSessionUser()`. Authorization via `defineAbilityFor(user)` against subject `EmailTemplate`.

### 3.1 Templates collection

#### `GET /api/email-templates`

- **Auth**: `read EmailTemplate`. Missing → `403 FORBIDDEN`. No session → `401 UNAUTHORIZED`.
- **Query params**:
  - `page` (int, default 1, min 1)
  - `limit` (int, default 20, min 1, max 100)
  - `search` (string, optional) — case-insensitive contains match against `title`, `code`, `subject`
  - `status` (`'active' | 'inactive'`, optional)
  - `emailType` (string, optional, exact match)
  - `sort` (string, optional) — one of `title|code|status|createdAt|updatedAt`, prefix `-` for desc; default `-createdAt`
- **Response**: `{ data: EmailTemplate[], meta: { page, limit, total, totalPages } }`. Excludes soft-deleted rows (`deletedAt IS NULL`).

#### `POST /api/email-templates`

- **Auth**: `create EmailTemplate`.
- **Body**: template create payload (§2.1). No phrases here — phrases are managed via the nested route after creation.
- **Behavior**: insert row; `code` collision → `409 CONFLICT`.
- **Response**: `201` with `{ data: EmailTemplate }`.

### 3.2 Single template

#### `GET /api/email-templates/[id]`

- **Auth**: `read EmailTemplate`.
- **Response**: `{ data: EmailTemplate & { phrases: EmailPhrase[] } }`. Phrases sorted by `key ASC`. `404 NOT_FOUND` if missing or soft-deleted.

#### `PATCH /api/email-templates/[id]`

- **Auth**: `update EmailTemplate`.
- **Body**: partial of template payload (§2.1) excluding `code` (server ignores `code` if sent).
- **Behavior**: bump `updatedAt`. Returns `{ data: EmailTemplate }`. `404 NOT_FOUND` for missing/soft-deleted.

#### `DELETE /api/email-templates/[id]`

- **Auth**: `delete EmailTemplate`.
- **Behavior**: **soft delete** — set `deletedAt = CURRENT_TIMESTAMP`. Phrases are left intact (they would only hard-cascade if the parent row were removed). `404 NOT_FOUND` if already deleted.
- **Response**: `{ data: { id } }`.

### 3.3 Phrases (nested)

#### `GET /api/email-templates/[id]/phrases`

- **Auth**: `read EmailTemplate`.
- **Response**: `{ data: EmailPhrase[] }`, sorted by `key ASC`. `404 NOT_FOUND` if parent missing/soft-deleted.

#### `POST /api/email-templates/[id]/phrases`

- **Auth**: `update EmailTemplate` (managing phrases is part of editing the template).
- **Body**: phrase create payload (§2.2). Server enforces parent existence and `(templateId, key)` uniqueness.
- **Response**: `201` with `{ data: EmailPhrase }`.

#### `PATCH /api/email-templates/[id]/phrases/[phraseId]`

- **Auth**: `update EmailTemplate`.
- **Body**: partial phrase payload (`key`, `value`). Renaming `key` re-checks uniqueness.
- **Response**: `{ data: EmailPhrase }`. `404 NOT_FOUND` if phrase doesn't belong to template.

#### `DELETE /api/email-templates/[id]/phrases/[phraseId]`

- **Auth**: `update EmailTemplate`.
- **Behavior**: hard delete (no soft-delete column exists on phrases).
- **Response**: `{ data: { id } }`.

### 3.4 Send

#### `POST /api/email-templates/[id]/send`

- **Auth**: `send EmailTemplate`. (Action `send` exists in `Actions` union.)
- **Body**: send-test payload (§2.3).
- **Behavior**:
  1. Load template (must be non-soft-deleted and `status === 'active'`; else `422 VALIDATION_ERROR` with message `Template is inactive`).
  2. Load all phrases for template, merge with `overrides` (override wins).
  3. Render `subject` and `body` by replacing every `{{key}}` token with the merged value (missing keys → empty string; downstream agent should also log a warning but not fail).
  4. Validate every recipient against `allowTo` (§2.3).
  5. Dispatch via the project's mail adapter (TBD; for now the route should call a helper `sendEmail({ to, subject, html })` from `lib/email/send.ts` — that helper is out of scope for this module, but the route must import it by that path).
- **Response**: `202` with `{ data: { sent: number, recipients: string[] } }`.
- **Errors**: provider errors → `500 INTERNAL_ERROR` with sanitized message.

---

## 4. UI

Routes live under `app/(dashboard)/email-templates/`. All pages must use `components/data-table/DataTable.tsx` for any tabular data, RHF + Zod for forms, and `sonner` for toasts. The right-side Sheet is the create surface; the editor is a full page.

### 4.1 List page — `app/(dashboard)/email-templates/page.tsx`

- **Guard**: requires `read EmailTemplate`; if absent show the standard "no access" empty state.
- **Data**: server-driven pagination via `GET /api/email-templates`. State (page, limit, search, status, sort) lives in the URL search params.
- **Toolbar**:
  - Search input (debounced 300 ms) bound to `search`.
  - Status filter chip group (`All`, `Active`, `Inactive`).
  - Optional `emailType` select (only rendered if at least one row in current view has a non-null type).
  - "New template" button (top right of toolbar) → opens the create Sheet. Hidden if user lacks `create EmailTemplate`.
- **Columns**:
  1. `title` — sortable, links to editor page (`/email-templates/[id]`).
  2. `code` — monospace, sortable.
  3. `subject` — truncated to 60 chars with tooltip.
  4. `status` — badge: green `Active` / muted `Inactive`. Sortable.
  5. `emailType` — plain text, sortable.
  6. `updatedAt` — relative time ("2 days ago") with absolute on hover. Sortable.
  7. Row actions (kebab dropdown):
     - `Edit` → navigate to editor page. Visible if `update EmailTemplate`.
     - `Send test` → opens a small modal asking for recipient(s); calls `POST /[id]/send`. Visible if `send EmailTemplate` and row `status === 'active'`.
     - `Delete` → confirm dialog → `DELETE /[id]`. Visible if `delete EmailTemplate`.

### 4.2 Create Sheet — child of list page

- Right-side Sheet (Framer Motion slide animation only on the Sheet itself).
- Fields (all from §2.1):
  - `title` (text input)
  - `code` (text input, slug-style helper hint, auto-derived from `title` until user edits manually)
  - `subject` (text input)
  - `emailType` (text input, optional)
  - `allowTo` (textarea, optional, helper: "Comma-separated emails or wildcard domains")
  - `status` (switch, default on/Active)
  - `body` is **not** in the Sheet — after successful create the user is redirected to the editor page where the body editor lives.
- Submit: `POST /api/email-templates`. On success: toast `Template created`, close Sheet, navigate to `/email-templates/{id}`.
- On `409 CONFLICT` for `code`: surface inline error on the `code` field.

### 4.3 Editor page — `app/(dashboard)/email-templates/[id]/page.tsx`

- **Guard**: `read EmailTemplate` to view; mutating controls disabled unless `update EmailTemplate`.
- **Layout**: two-column on `lg+`, single column below.
  - **Left column (main)**:
    - Header bar: template `title` (inline-editable), `code` (read-only badge), `status` switch, "Send test" button (gated on `send EmailTemplate`), "Delete" button (gated on `delete EmailTemplate`, soft-deletes then routes back to list).
    - `subject` text input (full width).
    - `body` HTML editor — a rich text / HTML editor component. The editor must:
      - support source-HTML view toggle,
      - expose an "Insert phrase" menu populated from the current phrase list (inserts `{{key}}` at cursor),
      - autosave is **not** required; explicit "Save" button at top right of the card commits a `PATCH /api/email-templates/[id]`.
    - Optional `allowTo` and `emailType` fields collapsed under an "Advanced" disclosure.
  - **Right column (side)**:
    - **Phrases sub-table** using `DataTable`:
      - Columns: `key` (monospace), `value` (truncated, click to expand inline), row actions (`Edit`, `Delete`).
      - Toolbar: "Add phrase" button → opens a small inline Sheet/Dialog with `key` + `value` (textarea). On save: `POST /[id]/phrases`.
      - Edit row → same dialog prefilled, submits `PATCH /[id]/phrases/[phraseId]`.
      - Delete row → confirm → `DELETE /[id]/phrases/[phraseId]`.
      - All phrase mutations gated on `update EmailTemplate`.
- **Send-test modal** (shared with list page):
  - Multi-email input (chip-style, min 1, max 10).
  - Optional "Override values" section listing every phrase key with the stored value as placeholder; user may type a per-recipient override.
  - Submit → `POST /[id]/send`. On success toast `Test email sent to N recipient(s)`. On `403 FORBIDDEN` (allow-list violation) surface field-level error on the offending recipient chip.

### 4.4 Loading / empty / error states

- Use `Skeleton` rows in the `DataTable` while loading (already built in).
- Empty list: message `No email templates yet.` + "New template" CTA (when permitted).
- Editor 404: render the standard not-found block with link back to `/email-templates`.

---

## 5. CASL Wiring

- **Subject**: `EmailTemplate` — already in the `Subjects` union; **no change needed** to `lib/acl/ability.ts`.
- **Module key → subject mapping**: `email-templates → EmailTemplate` — already in `moduleToSubject` in `lib/acl/ability.ts`. **No change needed.**
- **Action mapping** in `actionMap` already covers `view → read`, `add → create`, `edit → update`, `delete → delete`. The `send` action is **not** currently in `actionMap` because it's not a DB-stored permission name in the current matrix.
  - **Required change to `lib/acl/permissions-map.ts`**: extend the `email-templates` row's `actions` to include `send`:
    > `{ key: 'email-templates', label: 'Email Templates', actions: ['view', 'add', 'edit', 'delete', 'send'] }`
  - **Required change to `lib/acl/ability.ts` `actionMap`**: add `send: 'send'`.
  - **Required change to `PermissionAction` type** in `lib/acl/permissions-map.ts`: add `'send'` to the union.
- **Seed**: when seeding the `permissions` table, ensure rows exist for `(module='email-templates', action ∈ {view, add, edit, delete, send})`. Superadmin (`userType === 'superadmin'`) bypasses via `manage all`.
- **UI guards**: every gated control must call `useAbility().can(<action>, 'EmailTemplate')` (or equivalent context helper) and hide/disable accordingly. Buttons that would 403 must not render.
- **API guards**: each route handler checks the action listed in §3 against `defineAbilityFor(sessionUser)` and returns `403 FORBIDDEN` on failure (after the `401 UNAUTHORIZED` check for missing session).

---

## 6. Out of Scope / Assumptions

- The actual mail-transport implementation (`lib/email/send.ts`) is assumed to exist or be built separately; this spec only defines the route contract.
- HTML sanitization of `body` is the editor/renderer's concern, not a validation rule here.
- No versioning or audit log of template edits in this iteration.
- No bulk import/export.
- No localization of phrases (single value per key).

---

## 7. Self-verification Checklist

- [x] Stack facts encoded (SQLite + drizzle sqlite-core, iron-session, CASL subjects/actions, `{ data, meta }` shape, error codes, `DataTable`, RHF + Zod + sonner, Framer Motion only on Sheet).
- [x] Every table has `id`, `createdAt`, `updatedAt`; parent has `deletedAt` (phrases intentionally omit it — documented).
- [x] Existing subject `EmailTemplate` reused; no duplicate invented.
- [x] Existing schema mirrored exactly; DB tasks marked "skip — already exists".
- [x] Every field has validation rules; every route has auth, params, body, response, error codes.
- [x] CASL changes called out explicitly (new `send` action wiring).
- [x] No source code emitted — only types, shapes, names, and rules.
