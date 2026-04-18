---
name: seed-admin
description: Runs the database seed script (`pnpm db:seed`) to create the superadmin role + user and insert baseline permission rows. Idempotent — skips anything that already exists. Use after /db-migrate or when the user wants to reset auth.
---

# /seed-admin — run the database seed

Runs `pnpm db:seed`, which executes `scripts/seed.ts`. Creates:
1. The `superadmin` role (if missing).
2. A superadmin user (default: `admin@wds.local` / `Admin@1234`).
3. One `permissions` row per (module, action) pair declared in the seed script.

## Pre-flight

1. Verify `dev.db` exists. If missing, tell the user: `Run \`/db-migrate\` first to create the database.` and stop.
2. Verify `DATABASE_URL` is present in the environment (the seed script loads `.env.local` then `.env`).
3. Print the defaults that will be used and let the user override via env vars:
   ```
   Credentials (override via env):
     SEED_EMAIL    = admin@wds.local     (env: SEED_EMAIL)
     SEED_PASSWORD = Admin@1234          (env: SEED_PASSWORD)
     SEED_FNAME    = Super               (env: SEED_FNAME)
     SEED_LNAME    = Admin               (env: SEED_LNAME)
   ```

## Workflow

1. Run `pnpm db:seed`.
2. Parse the output for the credentials block — surface the login to the user.
3. If the script fails, show the error verbatim and common fixes:
   - `SCRAM-SERVER-FIRST-MESSAGE` → you're pointing at Postgres, not SQLite. Check `DATABASE_URL`.
   - `Could not locate the bindings file` → native bindings missing. The project uses `@libsql/client` which is WASM — no native build needed; check `lib/db/client.ts`.
   - `SQLITE_CONSTRAINT_UNIQUE` → seed is non-idempotent somewhere. Inspect `scripts/seed.ts`.

## Post-seed

Print the sign-in URL:
```
Sign in at: http://localhost:3000/login
Email:     <SEED_EMAIL>
Password:  <SEED_PASSWORD>
```

## Non-goals

Does not:
- Modify `scripts/seed.ts` itself (use `/casl-permissions` for that).
- Reset or delete existing users — it only inserts when rows are missing.
- Create the `dev.db` file — that's `/db-migrate`'s job.
