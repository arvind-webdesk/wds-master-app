---
name: casl-permissions
description: Wires CASL access control for a new module — appends the subject to lib/acl/ability.ts, updates lib/acl/permissions-map.ts so the Roles matrix shows it, and patches scripts/seed.ts to insert baseline permission rows. Delegates to casl-wiring agent. Idempotent.
---

# /casl-permissions <slug> — CASL-only wiring

Adds a new module to the CASL ability factory, the permission matrix, and the seed script.

## Input

- **`slug`** (required) — kebab-case module identifier (e.g. `invoices`)
- **`Subject`** (optional) — PascalCase subject (e.g. `Invoice`). If omitted, derived from slug.
- **`actions`** (optional) — subset of `['view','add','edit','delete','activate','send','export']`. Defaults to `['view','add','edit','delete']`; for read-only modules pass `['view']`.

If any required input is missing, ask via AskUserQuestion before continuing.

## Pre-flight

1. Verify `docs/modules/<slug>/spec.md` exists — it carries the canonical list of actions. If missing, invoke `module-architect` first.
2. Check if `Subject` is already in the `Subjects` union in `lib/acl/ability.ts`:
   - If yes → print `– CASL: <Subject> already wired` and exit (idempotent no-op).
   - If no → proceed.

## Workflow

1. Invoke `casl-wiring` agent with `slug`, `Subject`, `actions`, and mode.
2. Print summary of the 3 files touched.

## Post-scaffold

Remind the user:
- Run `/seed-admin` (`pnpm db:seed`) to insert the new `permissions` rows so the `/roles` matrix renders the new module.
- Visit `/roles` in the browser — your module should appear as a new row in the matrix.

## Non-goals

Does not create DB schema, API routes, or UI. This skill only edits 3 files:
- `lib/acl/ability.ts`
- `lib/acl/permissions-map.ts`
- `scripts/seed.ts`
