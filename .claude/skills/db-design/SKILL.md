---
name: db-design
description: Creates only the Drizzle SQLite schema file for a module. Delegates to db-schema-builder agent. Use when you have a schema to add but don't need full API + UI scaffolding.
---

# /db-design <slug> — schema-only scaffold

Creates a new Drizzle schema file under `lib/db/schema/<slug>.ts`, wires it into `lib/db/relations.ts` and `lib/db/index.ts`, and runs `pnpm drizzle-kit generate`.

## Input

- **`slug`** (required) — the table name in kebab-case
- **Field list** (optional) — if not provided, ask the user:
  - Column name (camelCase in TS)
  - Type (`text`, `integer`, `boolean`, FK)
  - Constraints (`notNull`, `unique`, nullable)

## Workflow

1. If no spec exists at `docs/modules/<slug>/spec.md`, invoke `module-architect` to write one (pass only the data-model section as required).
2. Invoke `db-schema-builder` with the spec.
3. Report the migration file that was generated in `drizzle/migrations/`.

## Post-scaffold

Remind the user to run `/db-migrate` to apply the migration to `dev.db`.

## Non-goals

Does not create API routes or UI. For that, use `/api-routes <slug>` and `/ui-table-page <slug>`, or `/scaffold-module <slug>` for the whole chain.
