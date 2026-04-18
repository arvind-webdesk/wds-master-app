---
name: db-migrate
description: Runs the Drizzle migration pipeline — `pnpm drizzle-kit generate` followed by `pnpm drizzle-kit migrate` to apply any pending schema changes to dev.db. Use after adding/editing a schema file, or when drizzle-kit reports pending migrations.
---

# /db-migrate — apply pending migrations

Two commands in sequence:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

## Pre-flight

1. Verify `drizzle.config.ts` exists.
2. Verify `dev.db` parent directory is writable (usually the repo root).
3. Check git status — if `drizzle/migrations/` has uncommitted migration files, prompt: `You have uncommitted migrations in drizzle/migrations/. Review them before applying? (y/n)`.

## Workflow

1. Run `pnpm drizzle-kit generate`:
   - If the output says "No schema changes", skip step 2 and report.
   - Otherwise, show the user the generated `.sql` file name.
2. Run `pnpm drizzle-kit migrate`:
   - On success: print `✓ Migrations applied`.
   - On failure: print the error and instruct the user to inspect `drizzle/migrations/` and/or reset `dev.db` (delete file + re-run) if this is a dev-only DB.

## Post-migrate

If this was the first migration of a new module, remind the user to run `/seed-admin` so baseline data (permissions, superadmin) reflects any new tables.

## Safety

- Never runs `pnpm drizzle-kit push` (bypasses migration history, dangerous).
- Never deletes `dev.db` automatically — if the migration is incompatible, tells the user to delete it manually.
