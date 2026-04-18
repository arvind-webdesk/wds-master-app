---
name: scaffold-core-modules
description: Master skill — generates full CRUD for all 7 core modules (users, roles, email-templates, activity-logs, api-logs, settings, dashboard) in one invocation. Runs pre-flight, two-wave agent orchestration, migration, and seed. Idempotent — skips modules whose page/route already exist.
---

# /scaffold-core-modules — master module scaffold

Generates **full CRUD** for every core module of `wds-dashboard-next` in a single run. Idempotent: re-running skips modules that already have pages and routes.

## The 7 modules

| slug              | Subject         | Depth                                              | Default actions                  |
|-------------------|-----------------|----------------------------------------------------|----------------------------------|
| `users`           | `User`          | list + create Sheet + detail (Account/Activity tabs) + activate/deactivate | view, add, edit, delete, activate |
| `roles`           | `Role`          | list + create Sheet + permission matrix grid       | view, add, edit, delete           |
| `email-templates` | `EmailTemplate` | list + create Sheet + editor page (subject+body+phrases) | view, add, edit, delete, send |
| `activity-logs`   | `ActivityLog`   | read-only list with filters (user, date, action)   | view                              |
| `api-logs`        | `ApiLog`        | read-only list with filters (method, status, error-only, date) | view               |
| `settings`        | `Setting`       | key-value editor + `/settings/account` profile     | view, edit                        |
| `dashboard`       | `Dashboard`     | real KPI cards + charts wired to DB queries        | view                              |

## Phase 1 — Pre-flight

1. **Environment**
   - Verify `dev.db` exists at repo root. If missing, instruct the user: `Run \`pnpm drizzle-kit migrate\` first.` and stop.
   - Verify `IRON_SESSION_SECRET` is set in `.env` (check existence of `.env`, do not read its contents due to the protect-secrets hook). If `.env` doesn't exist, instruct: `Run \`cp .env.example .env\` and set IRON_SESSION_SECRET first.` and stop.
2. **Git hygiene**
   - Run `git status --porcelain` — if dirty, warn the user but continue.
3. **Detection** — for each module, check if these exist:
   - `lib/db/schema/<slug>.ts` (schema)
   - `app/api/<slug>/route.ts` (API)
   - `app/(dashboard)/<slug>/page.tsx` (UI)
   - Subject present in `lib/acl/ability.ts`
4. **Print the plan table**:
   ```
   Module            Schema  API     UI      CASL    → Action
   users             ✓       ✗       ✗       ✓       → build API + UI
   roles             ✓       ✗       ✗       ✓       → build API + UI
   email-templates   ✓       ✗       ✗       ✓       → build API + UI
   ...
   ```
5. **Confirm** — print "Proceed? (y/n)" and wait for the user to reply `y`.

## Phase 2 — Wave A (sequential)

These modules touch shared files (`lib/acl/ability.ts`, `lib/acl/permissions-map.ts`, `scripts/seed.ts`). Run them one at a time to avoid merge conflicts.

Order: **users → roles → settings**.

For each module, in order:
1. Invoke `module-architect` with the slug, Subject, one-line description, and detected `mode` (`build` or `skip`).
2. Invoke `api-route-builder` with the same slug + mode.
3. Invoke `ui-dashboard-builder` with the same slug + mode.
4. Invoke `casl-wiring` with the same slug + Subject + mode.

## Phase 3 — Generate migrations (one-shot)

After Wave A, run:
```bash
pnpm drizzle-kit generate
```
This picks up any new schema columns added by Wave A (unlikely since all 8 schemas already exist, but safe). If output says "No schema changes", continue.

## Phase 4 — Wave B (parallel)

Independent modules — no shared-file contention possible because Wave A already did the heavy shared-file work. Launch these 4 agent chains **in parallel** via a single Agent-tool message with multiple invocations:

- `email-templates`
- `activity-logs`
- `api-logs`
- `dashboard`

Each chain internally is still sequential: architect → api → ui. (CASL wiring for Wave B happens in Phase 5 serialized, to avoid ability.ts conflicts.)

## Phase 5 — Serial CASL consolidation

Run `casl-wiring` for each Wave B module one at a time (4 serial invocations). This keeps `lib/acl/ability.ts` edits safe.

## Phase 6 — Seed + typecheck

1. Run `pnpm db:seed` — applies the baseline permission rows for new subjects.
2. Run `pnpm tsc --noEmit` — report any type errors. Do NOT attempt to fix them automatically; surface them to the user with exact file:line references so they can act.

## Phase 7 — Summary report

Print a table:
```
Module            Files created                                   Status
users             4 files (route.ts, [id]/route.ts, page.tsx, ...)  ✓
roles             4 files                                           ✓
...
```

Also print:
- Count of files touched
- Migration file generated (if any)
- Superadmin login reminder: `Sign in as admin@wds.local / Admin@1234`
- Next steps: `Run \`pnpm dev\` and visit /users, /roles, /email-templates, ...`

## Idempotency (important)

This skill is safe to re-run. On second run:
- Pre-flight detects all artefacts exist → every module marked `skip`.
- Every agent receives `mode: 'skip'` → agents print `– <layer>: exists, skipping <slug>` and stop.
- Zero file writes.

## Non-goals

- **Does not** install any new npm packages.
- **Does not** alter `package.json`, `tsconfig.json`, `next.config.ts`, `middleware.ts`, or `lib/db/client.ts`.
- **Does not** run `pnpm drizzle-kit push` or `pnpm drizzle-kit migrate` — agents only call `generate`. If you need to apply migrations, call `/db-migrate` separately.
- **Does not** deploy, build, or restart the dev server.

## Failure mode

If any Wave A module fails:
- Print the exact error.
- Stop before Phase 3. Do not start Wave B.
- Tell the user what's broken and how to rerun just the failing layer (via `/scaffold-module <slug>` or `/api-routes <slug>`, etc.).

If any Wave B module fails:
- Continue with the remaining 3 parallel chains.
- Still run Phase 5/6/7.
- Report the failed module in the summary table.
