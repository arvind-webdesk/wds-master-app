---
name: scaffold-module
description: Scaffolds a single new module end-to-end — runs module-architect → db-schema-builder → api-route-builder → ui-dashboard-builder → casl-wiring in sequence for one slug. Use when the user wants to add a new feature module beyond the 7 core ones.
---

# /scaffold-module <slug> — single-module scaffold

Builds one new module using the full agent chain. Use this for new features added AFTER the 7 core modules are in place (e.g. `/scaffold-module customers`, `/scaffold-module invoices`).

## Input

The user provides:
- **`slug`** (required) — kebab-case, matches URL path (e.g. `customers`, `support-tickets`)
- **Short description** — one-liner of what the module does
- **`Subject`** (optional) — PascalCase CASL subject; if omitted, derive from slug (e.g. `customers` → `Customer`)

If any of these are missing, ask the user via AskUserQuestion before proceeding.

## Pre-flight

1. Verify `dev.db` exists and `.env` exists (same checks as `/scaffold-core-modules`).
2. Check if `app/(dashboard)/<slug>/page.tsx` or `app/api/<slug>/route.ts` already exists.
   - If yes: ask the user whether to skip (default) or overwrite. Pass `mode` to agents accordingly.
   - If no: proceed in `mode: 'build'`.

## Workflow

Run **sequentially**:

1. `module-architect` — produces `docs/modules/<slug>/spec.md`.
2. `db-schema-builder` — creates `lib/db/schema/<slug>.ts`, updates relations + barrel, runs `pnpm drizzle-kit generate`.
3. `api-route-builder` — creates `app/api/<slug>/route.ts` + `[id]/route.ts` (+ sub-routes per spec).
4. `ui-dashboard-builder` — creates `app/(dashboard)/<slug>/page.tsx` + `components/<slug>/*.tsx`.
5. `casl-wiring` — edits `lib/acl/ability.ts`, `lib/acl/permissions-map.ts`, `scripts/seed.ts`.

## Post-scaffold

1. Run `pnpm drizzle-kit migrate` to apply the new schema to `dev.db`. (Ask the user first if the working tree was dirty.)
2. Run `pnpm db:seed` to insert new permission rows.
3. Run `pnpm tsc --noEmit` — surface errors without auto-fixing.
4. Print summary + next steps (visit `/<slug>` in the browser).

## When to use this vs `/scaffold-core-modules`

- `/scaffold-core-modules` — first pass, builds all 7 baseline modules at once.
- `/scaffold-module <slug>` — every module added after that.
