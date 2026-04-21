# Module Spec: `connections`

> Written by the `module-architect` agent. Consumed by `db-schema-builder`,
> `api-route-builder`, `ui-dashboard-builder`, and `casl-wiring`.
> **No source code in this file — types, shapes, and behaviours only.**

## 1. Overview

- **Purpose**: Unified CRUD for commerce-platform connections (Shopify, BigCommerce, and future platforms). Replaces the separate `/shopify` and `/bigcommerce` pages with a single `/connections` list where the user picks a platform **type** via dropdown and supplies platform-specific credentials. Each connection stores an **encrypted** credentials blob (AES-GCM) and is the source of truth that `sync-history`, `cron-sync`, and the integrations sync workers read from. Used by admins/superadmins to register, test, enable/disable, and delete platform connections.
- **Module slug**: `connections`
- **CASL Subject**: `Connection` (**new** — must be added to the `Subjects` union in `lib/acl/ability.ts`)
- **Sidebar entry?** yes
- **Read-only?** no

## 2. Data model — `lib/db/schema/connections.ts`

> **New schema file** — `lib/db/schema/connections.ts` does not yet exist. `db-schema-builder` must create it and generate a migration.

| Column (TS)        | DB name            | Drizzle type                                                                              | Constraints          | Notes                                                                                       |
|--------------------|--------------------|-------------------------------------------------------------------------------------------|----------------------|---------------------------------------------------------------------------------------------|
| `id`               | `id`               | `integer('id').primaryKey({ autoIncrement: true })`                                       | PK                   | always                                                                                      |
| `name`             | `name`             | `text('name')`                                                                            | notNull              | user-friendly label, e.g. "Acme Prod Shopify"                                               |
| `type`             | `type`             | `text('type')`                                                                            | notNull              | enum string: `'shopify' \| 'bigcommerce'`                                                   |
| `status`           | `status`           | `text('status').default('active')`                                                        | notNull              | enum string: `'active' \| 'disabled' \| 'error'`                                            |
| `storeIdentifier`  | `store_identifier` | `text('store_identifier')`                                                                | notNull              | Shopify: `*.myshopify.com` domain. BigCommerce: store hash (e.g. `stores/abc123`)           |
| `credentials`      | `credentials`      | `text('credentials')`                                                                     | nullable             | **AES-GCM encrypted** JSON string (see §2.1). **Never** exposed in API responses.           |
| `lastSyncAt`       | `last_sync_at`     | `text('last_sync_at')`                                                                    | nullable             | ISO 8601; bumped by sync workers, not this module's routes                                  |
| `createdBy`        | `created_by`       | `integer('created_by').references(() => users.id, { onDelete: 'set null' })`              | nullable FK          | user who registered the connection                                                          |
| `createdAt`        | `created_at`       | `text('created_at').default(sql\`(CURRENT_TIMESTAMP)\`).notNull()`                        | notNull              | always                                                                                      |
| `updatedAt`        | `updated_at`       | `text('updated_at').default(sql\`(CURRENT_TIMESTAMP)\`).notNull()`                        | notNull              | bumped on every PATCH / status flip / credential rotation                                    |
| `deletedAt`        | `deleted_at`       | `text('deleted_at')`                                                                      | nullable             | soft-delete                                                                                 |

**Indexes**:
- `connections_type_idx` on `type`
- `connections_status_idx` on `status`
- `connections_store_identifier_idx` on `store_identifier`
- `connections_deleted_at_idx` on `deleted_at`
- `connections_type_store_identifier_uq` — **unique** partial index on `(type, store_identifier)` filtered by `deleted_at IS NULL` (prevents two active connections for the same shopify shop / bc hash). Implemented as `uniqueIndex(...).on(t.type, t.storeIdentifier).where(sql\`deleted_at IS NULL\`)`.

**Relations** (add in `lib/db/relations.ts`):
- `connections.createdBy` → `users.id` (many connections created by one user)
- Back-ref on `users`: `connections: many(connections)` (optional, additive)

**Types exported from schema file**:
- `Connection         = typeof connections.$inferSelect`
- `NewConnection      = typeof connections.$inferInsert`
- `ConnectionType     = 'shopify' | 'bigcommerce'`
- `ConnectionStatus   = 'active' | 'disabled' | 'error'`
- `SafeConnection     = Omit<Connection, 'credentials'> & { hasCredentials: boolean }` — **API routes MUST return `SafeConnection`, never `Connection`**.

### 2.1 Encrypted credentials payload

`credentials` on disk is a single string: `<ivBase64>:<authTagBase64>:<ciphertextBase64>` (AES-256-GCM, 12-byte IV, 16-byte auth tag). Plaintext is JSON — shape depends on `type`:

- **shopify**:
  ```
  {
    accessToken: string,          // OAuth access token (shpat_...)
    scope:       string,          // comma-separated granted scopes
    installedAt: string (ISO)
  }
  ```
- **bigcommerce**:
  ```
  {
    storeHash:  string,
    accessToken: string,          // X-Auth-Token
    clientId:    string,
    clientSecret?: string         // optional for some app types
  }
  ```

The plaintext is **never** serialized outside `lib/crypto/encryption.ts`. Add a type `ConnectionCredentials = ShopifyCredentials | BigCommerceCredentials` exported from `lib/crypto/connection-credentials.ts` (discriminated by the caller's `type`).

### 2.2 Crypto helper — `lib/crypto/encryption.ts`

New file (planned, **not** created by this spec).

- Algorithm: `aes-256-gcm` (Node `crypto` module).
- Key source: `process.env.CONNECTION_ENCRYPTION_KEY` — a base64-encoded 32-byte key. On module import, decode and assert `length === 32`; throw on misconfiguration.
- Public API:
  - `encrypt(obj: unknown): string` — serializes `obj` to JSON, generates a fresh random 12-byte IV, returns `iv.b64:tag.b64:ciphertext.b64`.
  - `decrypt<T = unknown>(payload: string): T` — splits the three parts, verifies auth tag, returns parsed JSON. Throws `CryptoError` on malformed/tampered input.
- Must be **server-only** — file begins with `import 'server-only'`.
- No caller outside `app/api/connections/**` may import it.

## 3. API surface

Response shape (enforced):
- Success: `{ data: T, meta?: { total, page, limit } }`
- Error:   `{ error: { message: string, code: ErrorCode } }`
- Codes: `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL_ERROR`

All routes:
1. Call `getSessionUser()`; if null → 401 `UNAUTHORIZED`.
2. Build `defineAbilityFor(user)`; if CASL check fails → 403 `FORBIDDEN`.
3. **Never return the `credentials` column.** Projection must shape to `SafeConnection` (omit `credentials`, add `hasCredentials: credentials != null`).
4. List/get: filter `isNull(connections.deletedAt)` unless explicitly noted.

| Method | Path                                         | CASL check                          | Zod body/query                                                                                                                                          | Success returns                                              | Status |
|--------|----------------------------------------------|-------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------|--------|
| GET    | `/api/connections`                           | `can('read', 'Connection')`         | query: `page?=1, limit?=20 (max 100), search?=string, type?='shopify'\|'bigcommerce', status?='active'\|'disabled'\|'error', sort?=string, order?='asc'\|'desc'` | `{ data: SafeConnection[], meta: { total, page, limit } }`   | 200    |
| POST   | `/api/connections`                           | `can('create', 'Connection')`       | see §3.1                                                                                                                                                | `{ data: SafeConnection }`                                    | 201    |
| GET    | `/api/connections/[id]`                      | `can('read', 'Connection')`         | —                                                                                                                                                       | `{ data: SafeConnection & { createdByUser?: { id, email, firstName, lastName } \| null } }` | 200    |
| PATCH  | `/api/connections/[id]`                      | `can('update', 'Connection')`       | see §3.2                                                                                                                                                | `{ data: SafeConnection }`                                    | 200    |
| DELETE | `/api/connections/[id]`                      | `can('delete', 'Connection')`       | —                                                                                                                                                       | `{ data: { id } }` (soft-delete: set `deletedAt = CURRENT_TIMESTAMP`, `status = 'disabled'`) | 200 |
| POST   | `/api/connections/[id]/test`                 | `can('update', 'Connection')`       | —                                                                                                                                                       | `{ data: { ok: true, platform, checkedAt, details?: { shopName?, apiVersion?, ... } } }` on success; on platform failure still **200** with `{ data: { ok: false, platform, checkedAt, error: string } }` and also flips `status` to `'error'` | 200 |
| GET    | `/api/connections/shopify/install`           | `can('create', 'Connection')`       | query: `shop=string (required, must match `/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i`)`                                                                    | **302 redirect** to Shopify OAuth `/admin/oauth/authorize?...` with generated `state` (stored in iron-session under `shopifyOAuth: { state, shop, returnTo }`) | 302 |
| GET    | `/api/connections/shopify/callback`          | `can('create', 'Connection')`       | query: `code=string, shop=string, state=string, hmac=string, timestamp=string`                                                                          | **302 redirect** to `/connections/[id]?tab=overview&connected=1` after exchanging `code` for `access_token`, verifying `hmac` + `state`, and upserting a connection row | 302 |

### 3.1 Zod rules (POST /api/connections)

Discriminated union on `type`.

Common fields:
- `name`:             `z.string().trim().min(1).max(120)`
- `type`:             `z.enum(['shopify','bigcommerce'])`
- `status`:           `z.enum(['active','disabled','error']).default('active')`
- `storeIdentifier`:  `z.string().trim().min(1).max(255)` — shape validated by `type`:
  - `shopify`: must match `/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i` (lowercased before insert).
  - `bigcommerce`: must match `/^[a-z0-9]+$/i` (store hash only; no leading `stores/`).

Type-specific credentials body (required for BigCommerce manual create; **forbidden** for Shopify — Shopify connections are created only via OAuth callback):
- When `type === 'shopify'`:
  - POST body **must omit** `credentials`. If provided → 422 `VALIDATION_ERROR` with message "Shopify connections must be created via OAuth. Use /api/connections/shopify/install".
  - The only way to create a shopify row is the OAuth callback; the manual POST path creates a **stub** row only if explicitly allowed (it is **not** allowed by this spec). Enforce with the rule above.
- When `type === 'bigcommerce'`:
  - `credentials`: required object
    - `storeHash`:    `z.string().trim().regex(/^[a-z0-9]+$/i).min(1).max(64)` — must equal `storeIdentifier`.
    - `accessToken`:  `z.string().trim().min(10).max(500)`
    - `clientId`:     `z.string().trim().min(1).max(200)`
    - `clientSecret`: `z.string().trim().min(1).max(500).optional()`

**Uniqueness**: on insert, reject with 409 `CONFLICT` if a non-deleted row already has the same `(type, storeIdentifier)`. Message: "A connection for this store already exists."

**On insert**: encrypt the credentials object via `lib/crypto/encryption.ts` before writing `credentials`. Set `createdBy = session.user.id`.

### 3.2 Zod rules (PATCH /api/connections/[id])

All create fields become optional, **minus** `type` and `storeIdentifier` (immutable — to change the target store, delete + recreate). Additionally:
- `credentials` on PATCH: optional. When present and `type === 'shopify'` → reject (422); Shopify credentials are rotated only by the OAuth callback. When present and `type === 'bigcommerce'` → re-encrypt full object (partial credential patches are **not** supported).
- `status`: `z.enum(['active','disabled','error']).optional()` — callers may manually disable/re-enable a connection.
- `updatedAt` bumped on every PATCH.

### 3.3 `POST /api/connections/[id]/test` behaviour

Load connection, decrypt credentials, then:
- **shopify**: `GET https://{storeIdentifier}/admin/api/2024-10/shop.json` with `X-Shopify-Access-Token`. Success → `{ ok: true, details: { shopName, domain, planName } }`.
- **bigcommerce**: `GET https://api.bigcommerce.com/stores/{storeHash}/v2/store` with `X-Auth-Token`. Success → `{ ok: true, details: { name, domain, controlPanelBaseUrl } }`.

On network error or non-2xx: return `{ data: { ok: false, error: '<short reason>' } }` **and** update the row to `status = 'error'`. On success, if current status was `'error'`, flip it back to `'active'`.

Timeouts: 10s per request. Never leak upstream response bodies verbatim in the error string — pass through a sanitised summary (`HTTP 401`, `HTTP 403`, `network timeout`, `invalid response`).

### 3.4 Shopify OAuth install + callback

**`GET /api/connections/shopify/install?shop=...`**:
1. Validate `shop` regex.
2. Generate cryptographically-random `state` (32 bytes, base64url).
3. Persist `shopifyOAuth = { state, shop, returnTo: '/connections', startedAt }` in iron-session via `getSession()`.
4. Redirect to `https://{shop}/admin/oauth/authorize?client_id={SHOPIFY_CLIENT_ID}&scope={SHOPIFY_SCOPES}&redirect_uri={APP_URL}/api/connections/shopify/callback&state={state}`.
5. Required env: `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_SCOPES`, `APP_URL`.

**`GET /api/connections/shopify/callback`**:
1. Read `shopifyOAuth` from session → 400 `VALIDATION_ERROR` if missing.
2. Verify `state` matches; verify `shop` matches; verify `hmac` signature over the other query params using `SHOPIFY_CLIENT_SECRET`. Any mismatch → 400 `VALIDATION_ERROR`.
3. POST `https://{shop}/admin/oauth/access_token` with `{ client_id, client_secret, code }` → extract `access_token`, `scope`.
4. Upsert on `(type='shopify', storeIdentifier=shop)`:
   - If a non-deleted row exists → update `credentials` (re-encrypt with new access token), set `status = 'active'`, bump `updatedAt`.
   - Else insert new row: `name = shop` (user can rename later), `type='shopify'`, `status='active'`, `storeIdentifier=shop`, `credentials=encrypt({ accessToken, scope, installedAt: now })`, `createdBy = session.user.id`.
5. Clear `shopifyOAuth` from session.
6. Redirect `302` to `/connections/{id}?tab=overview&connected=1`.

### 3.5 Pagination & search defaults

`page=1, limit=20` (max 100). Soft-delete filter: `isNull(deletedAt)`. Default sort: `createdAt desc`. Search is case-insensitive `LIKE` across `name` and `storeIdentifier`.

## 4. UI surface

### 4.1 List page — `app/(dashboard)/connections/page.tsx`

Uses `components/data-table/DataTable.tsx`. Client wrapper calls `/api/connections`.

- **Columns** (left to right):
  | Header            | tanstack id         | Sortable | Notes                                                                                             |
  |-------------------|---------------------|----------|---------------------------------------------------------------------------------------------------|
  | Name              | `name`              | yes      | plain text                                                                                        |
  | Type              | `type`              | yes      | badge with platform icon (Shopify green / BigCommerce blue)                                       |
  | Store             | `storeIdentifier`   | no       | monospace; for shopify, render as link `https://{domain}` opening in new tab                      |
  | Status            | `status`            | yes      | green `Active` / muted `Disabled` / red `Error` badge                                              |
  | Last Sync         | `lastSyncAt`        | yes      | localized relative time ("2 hours ago"), `—` if null                                              |
  | Created           | `createdAt`         | yes      | localized date                                                                                    |
  | Actions           | `actions`           | no       | row menu (see below)                                                                              |

- **Toolbar**:
  - Debounced search input (300ms) → `?search=`
  - Filter chips: `Type` (`All / Shopify / BigCommerce`), `Status` (`All / Active / Disabled / Error`)
  - `Clear all` link when any filter active
  - Right-aligned primary button: `New connection` (guarded by `can('create','Connection')`)
- **Row actions** (dropdown, each guarded by CASL):
  - `View` → navigate to `/connections/[id]`
  - `Edit` (`update`) → opens edit Sheet
  - `Test connection` (`update`) → `POST /api/connections/[id]/test`, show result via sonner (`ok` → success toast; `!ok` → error toast with sanitised reason)
  - `Disable` / `Enable` (`update`) → `PATCH` with `{ status }`
  - `Reconnect via OAuth` (shopify rows only, `update`) → window-navigate to `/api/connections/shopify/install?shop={storeIdentifier}`
  - `Delete` (`delete`) → confirm dialog → `DELETE /api/connections/[id]` → sonner toast + table refresh
- **Create**: right-side `<Sheet>` (Framer Motion slide) — see §4.3.
- **Empty state**: "No connections yet" + two primary CTAs: `Connect Shopify` (opens Sheet with `type=shopify` preselected) and `Connect BigCommerce` (opens Sheet with `type=bigcommerce` preselected). Both hidden if caller lacks `create`.
- **Loading**: DataTable `isLoading` skeletons.
- **URL-synced state**: `?page`, `?limit`, `?search`, `?type`, `?status`, `?sort`, `?order` via `useSearchParams` + `router.replace`.
- **OAuth return banner**: when `?connected=1` is present in URL, render a sonner success toast ("Connection established") and strip the param via `router.replace`.

### 4.2 Detail page — `app/(dashboard)/connections/[id]/page.tsx`

- **Header card**: `name` (h1), type badge, store identifier (monospace), status badge, last-sync timestamp. Primary actions: `Edit` (opens edit Sheet), `Test connection`, `Disable`/`Enable` toggle, `Delete` (destructive). All guarded by CASL.
- **Tabs** (URL-synced via `?tab=overview|credentials|sync-runs|schedules`, default `overview`):
  - **Overview** — read-only grid: name, type, storeIdentifier, status, lastSyncAt, createdBy (linked to `/users/[id]`), createdAt, updatedAt. `Edit` button opens Sheet in edit mode.
  - **Credentials** — mask/reveal UI. Initial render: all credential fields masked as `••••••••` with a `Reveal` button. Click `Reveal` → calls a dedicated **not-yet-implemented** endpoint out of scope for this module; **within this spec**, the Credentials tab only displays:
    - `hasCredentials: true/false`
    - For shopify: `scope` (readable from a planned future endpoint) and `installedAt`
    - For bigcommerce: `clientId` (last-4 masked), `storeHash`
    - A "Rotate credentials" button:
      - shopify → redirects to `/api/connections/shopify/install?shop={storeIdentifier}`
      - bigcommerce → opens the edit Sheet scrolled to the credentials section
    - **Decrypted secrets (accessToken, clientSecret) are NEVER rendered in the UI** — the spec enforces write-only behaviour for those fields.
  - **Sync runs** — reads from the **existing `syncRuns` table** (see `lib/db/schema/integrations.ts`) filtered by `platform = row.type` and (future) `connectionId` if added later. For this module, the tab embeds a list fetched from `GET /api/sync-runs?platform={type}&limit=20` (sync-history module's responsibility — just link/embed). Columns: started, finished, target, status, records upserted, error. Empty state: "No sync runs yet for this connection."
  - **Schedules** — links to the `cron-sync` module filtered by this connection. Embed `GET /api/cron-sync?connectionId={id}` list when available; otherwise render a stub "No schedules configured" + CTA button `Add schedule` that navigates to `/cron-sync/new?connectionId={id}`.
- **Forms**: RHF + Zod, `useTransition` for mutations, sonner toast on success/failure, field-level error rendering from `{ error: { code: 'VALIDATION_ERROR' } }` responses.
- **Not found**: if `GET /api/connections/[id]` returns 404 → Next.js `notFound()`.

### 4.3 Sheet fields (Create / Edit) — `components/connections/connections-sheet.tsx`

Same Sheet drives both modes; `mode: 'create' | 'edit'` prop switches submit handler. **Fields are conditional on `type`.** On edit, `type` and `storeIdentifier` are **read-only** (rendered as disabled inputs).

**Common fields** (always visible):

| Field             | Input control                                    | Zod validation                                                                    | Required        |
|-------------------|--------------------------------------------------|-----------------------------------------------------------------------------------|-----------------|
| `name`            | `Input`                                          | `z.string().trim().min(1).max(120)`                                               | yes             |
| `type`            | `Select` (`Shopify` / `BigCommerce`)             | `z.enum(['shopify','bigcommerce'])`                                               | yes (create only; locked in edit) |
| `status`          | `Select` (`Active` / `Disabled` / `Error`)       | `z.enum(['active','disabled','error'])`                                           | yes (default `active`); `Error` option disabled in create (system-set only) |

**Shopify branch** (`type === 'shopify'`):

| Field             | Input control                                    | Zod validation                                                                    | Required                              |
|-------------------|--------------------------------------------------|-----------------------------------------------------------------------------------|---------------------------------------|
| `storeIdentifier` | `Input` with suffix `.myshopify.com`             | `z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i)`                       | yes (create); locked in edit          |
| **Connect via OAuth button** | not a form field — primary CTA                | n/a                                                                               | **Submits by navigating** the browser to `/api/connections/shopify/install?shop={storeIdentifier}`. On create mode, clicking this button skips the normal POST and triggers OAuth; the row will be created server-side in the callback handler. |

In create mode for Shopify, the Sheet's normal `Save` button is **disabled** — the only path to save is `Connect via OAuth`. A helper text explains: "Shopify connections must be authorized via OAuth." In edit mode, `Save` is enabled (user can rename, change status), credentials show a `Reconnect via OAuth` button instead.

**BigCommerce branch** (`type === 'bigcommerce'`):

| Field                       | Input control                       | Zod validation                                                                    | Required                  |
|-----------------------------|-------------------------------------|-----------------------------------------------------------------------------------|---------------------------|
| `storeIdentifier`           | `Input` (store hash)                | `z.string().regex(/^[a-z0-9]+$/i).min(1).max(64)`                                 | yes (create); locked in edit |
| `credentials.storeHash`     | `Input` (auto-filled from `storeIdentifier`, read-only) | must equal `storeIdentifier`                                | yes                       |
| `credentials.accessToken`   | `Input` type=password               | `z.string().trim().min(10).max(500)`                                              | yes (create); optional in edit (only required if rotating) |
| `credentials.clientId`      | `Input`                             | `z.string().trim().min(1).max(200)`                                               | yes (create); optional in edit |
| `credentials.clientSecret`  | `Input` type=password               | `z.string().trim().min(1).max(500).optional()`                                    | no                        |

- Submit: `create` → `POST /api/connections` (BigCommerce only); `edit` → `PATCH /api/connections/[id]` with only changed fields. For BigCommerce edit, if any `credentials.*` field changed, the Sheet bundles **all four** credential fields (re-entering accessToken) into the PATCH — the server re-encrypts the full object.
- On 409 CONFLICT: set field error on `storeIdentifier`.
- On 422 VALIDATION_ERROR: map to field if message is field-scoped, else top-of-form alert.
- Close behaviour: dismiss confirms only if form is dirty.

## 5. CASL wiring

- **Subject**: `Connection` — **new**. Must be added to the `Subjects` union in `lib/acl/ability.ts`.
- **`moduleToSubject` map** in `lib/acl/ability.ts`: add `connections: 'Connection'`.
- **Actions used by this module**: `'read'`, `'create'`, `'update'`, `'delete'`. (`'test'` is authorized under `'update'` — see §3.3. No module-specific action required.)
- **Permissions map** (`lib/acl/permissions-map.ts`): add a new entry:
  ```
  { key: 'connections', label: 'Connections', actions: ['view', 'add', 'edit', 'delete'] }
  ```
  `PermissionAction` union already covers `'view' | 'add' | 'edit' | 'delete'` — no widening needed.
- **Action map** (`actionMap` in `lib/acl/ability.ts`): no changes required — existing `view→read, add→create, edit→update, delete→delete` mappings are sufficient.
- **Seed** (`scripts/seed.ts`): for the `superadmin` role, ensure `role_permissions` rows exist for every `(connections, action)` pair: `view`, `add`, `edit`, `delete`. Superadmin also gets `manage all` at runtime, but DB rows should still be complete for matrix UI correctness.
- **Deprecation note**: the existing `Integrations` subject and the `integrations` permissions-map entry remain for the sync-execution permissions (`view`, `sync`) — do **not** remove them. This new `Connection` subject is purely for CRUD over the credential records.

## 6. Sidebar entry

- **Label**: `Connections`
- **Icon**: `Plug` from `lucide-react`
- **Href**: `/connections`
- **Order**: replaces the existing `Shopify` and `BigCommerce` entries — both of those items must be **removed** from `components/shell/Sidebar.tsx`. `Connections` takes the position of the former `Shopify` entry.
- **Visibility**: render only if `can('read', 'Connection')`.

## 7. File checklist

- [ ] `lib/db/schema/connections.ts` — **new file**
- [ ] `drizzle/migrations/*` — new migration generated via drizzle-kit
- [ ] `lib/db/relations.ts` — add `connections ↔ users` relation
- [ ] `lib/db/index.ts` — add barrel export of `connections`
- [ ] `lib/crypto/encryption.ts` — **new file** (`encrypt` / `decrypt`, server-only, AES-256-GCM)
- [ ] `lib/crypto/connection-credentials.ts` — **new file** (types `ShopifyCredentials`, `BigCommerceCredentials`, `ConnectionCredentials`)
- [ ] `app/api/connections/route.ts` — GET (list), POST (create, BigCommerce only)
- [ ] `app/api/connections/[id]/route.ts` — GET, PATCH, DELETE (soft)
- [ ] `app/api/connections/[id]/test/route.ts` — POST (health check)
- [ ] `app/api/connections/shopify/install/route.ts` — GET (302 to Shopify OAuth)
- [ ] `app/api/connections/shopify/callback/route.ts` — GET (exchange code, upsert, 302 back)
- [ ] `app/(dashboard)/connections/page.tsx` — list page
- [ ] `app/(dashboard)/connections/[id]/page.tsx` — detail page with Overview/Credentials/Sync runs/Schedules tabs
- [ ] `components/connections/connections-sheet.tsx` — create/edit Sheet (RHF + Zod, conditional branches by type)
- [ ] `components/connections/connections-columns.tsx` — TanStack column defs
- [ ] `components/connections/connections-row-actions.tsx` — row dropdown menu
- [ ] `components/connections/connection-type-badge.tsx` — small presentational badge
- [ ] `components/connections/connection-status-badge.tsx` — small presentational badge
- [ ] `lib/acl/ability.ts` — add `'Connection'` to `Subjects`; add `connections: 'Connection'` to `moduleToSubject`
- [ ] `lib/acl/permissions-map.ts` — add `connections` entry
- [ ] `scripts/seed.ts` — ensure superadmin has `connections.(view|add|edit|delete)` role-permissions
- [ ] `components/shell/Sidebar.tsx` — **remove** Shopify + BigCommerce links; **add** `Connections` link (guarded by `read Connection`)
- [ ] **Deprecate / remove** `app/(dashboard)/shopify/*` and `app/(dashboard)/bigcommerce/*` pages (out of scope for this module's builder — list here for tracking)
- [ ] `.env.example` — document `CONNECTION_ENCRYPTION_KEY`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_SCOPES`, `APP_URL`
