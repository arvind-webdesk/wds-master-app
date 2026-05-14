## ADDED Requirements

### Requirement: Full-stack scaffold generates four code layers per module
The system SHALL provide `lib/sow/full-scaffold.ts` exporting `fullScaffoldModule(spec, options)` that orchestrates four sequential Anthropic SDK calls to generate and write:
1. **Schema** — `lib/db/schema/<slug>.ts` + barrel export in `lib/db/index.ts`
2. **API routes** — `app/api/<slug>/route.ts` + `app/api/<slug>/[id]/route.ts`
3. **UI pages** — `app/(dashboard)/<slug>/page.tsx` + `app/(dashboard)/<slug>/[id]/page.tsx`
4. **CASL hint** — `lib/acl/hints/<slug>.ts` (a comment file listing required Subject + permission rows; does NOT patch ability.ts directly)

#### Scenario: All four layers succeed
- **WHEN** `fullScaffoldModule` is called with a valid spec and all layers succeed
- **THEN** the function returns `{ ok: true, layers: [{ name, files, warnings }] }` with all four layers populated and every listed file existing on disk

#### Scenario: A layer fails without stopping subsequent layers
- **WHEN** one layer (e.g. UI pages) returns an error from Claude
- **THEN** that layer's entry in `layers` has `{ ok: false, error: '...' }` but the remaining layers still execute and the overall result has `{ ok: false }` only if all layers failed

#### Scenario: Schema layer refuses to overwrite existing file
- **WHEN** `lib/db/schema/<slug>.ts` already exists and `overwrite` is `false`
- **THEN** the schema layer returns `{ ok: false, error: 'Schema file already exists...' }` and the remaining layers are skipped

### Requirement: Generated API routes follow the canonical project pattern
The API route handler generator SHALL produce routes that follow the same session → Zod → CASL → Drizzle → response pattern enforced by the `api-route-builder` agent, returning `{ data, meta? }` on success and `{ error: { message, code } }` on failure.

#### Scenario: Generated GET /api/<slug> route returns paginated data
- **WHEN** the generated list route handler receives a GET request
- **THEN** it reads the session, checks CASL `read` permission, queries Drizzle with optional `search` and pagination params, and returns `{ data: [...], meta: { total, page, limit } }`

### Requirement: Generated UI pages use DataTable and the project's Tailwind tokens
The UI page generator SHALL produce list pages that use `components/data-table/DataTable.tsx` and detail/edit pages that use `react-hook-form` + `zod` + `sonner` toasts, matching the style of existing module pages.

#### Scenario: Generated list page imports DataTable
- **WHEN** the generated `app/(dashboard)/<slug>/page.tsx` is written
- **THEN** the file contains `import { DataTable }` from the project's DataTable component path

### Requirement: CASL hint file guides manual wiring
Rather than patching `lib/acl/ability.ts` directly, the scaffold SHALL write `lib/acl/hints/<slug>.ts` containing a block comment that lists: the Subject name to add to the Subjects union, the `moduleToSubject` entry, and the baseline `role_permissions` rows to insert in `scripts/seed.ts`.

#### Scenario: CASL hint file is written for every scaffolded module
- **WHEN** `fullScaffoldModule` completes successfully for a module with slug `invoices`
- **THEN** `lib/acl/hints/invoices.ts` exists and contains a comment block with Subject, moduleToSubject, and seed rows

### Requirement: Scaffold respects the overwrite flag
`fullScaffoldModule` SHALL accept an `options.overwrite: boolean` flag. When `false` (default), any existing file causes that layer to skip with a warning. When `true`, existing files are replaced.

#### Scenario: Overwrite false skips existing files
- **WHEN** `fullScaffoldModule` is called with `overwrite: false` and `app/api/<slug>/route.ts` already exists
- **THEN** the API layer returns `{ ok: false, error: 'File already exists: ...' }` and the file is not modified

#### Scenario: Overwrite true replaces existing files
- **WHEN** `fullScaffoldModule` is called with `overwrite: true`
- **THEN** all existing files for this module are replaced with freshly generated content
