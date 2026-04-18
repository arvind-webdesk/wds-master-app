---
name: apply-onboarding
description: Applies onboarding data to this cloned dashboard in one shot. Delegates to `pnpm apply:config`, which reads seed-data.json, regenerates lib/client-config.ts, patches the brand color into globals.css, migrates the DB, and seeds the admin user. Run this ONCE inside a freshly cloned client repo (or trigger it programmatically during provisioning).
---

# /apply-onboarding — configure this dashboard from the onboarding data

This skill is a thin wrapper around `pnpm apply:config` (→ `scripts/apply-config.ts`). It exists so human devs using Claude Code and the automated ProvisioningService pipeline hit the same code path.

## Flow

```
Read seed-data.json
      │
      ▼
Regenerate lib/client-config.ts        ← client name, brand color, enabled modules
      │
      ▼
Replace/append brand block in globals.css   ← --accent + --ring in oklch
      │
      ▼
Write docs/client-notes.md (if notes)
      │
      ▼
pnpm drizzle-kit migrate               ← can be skipped with --no-migrate
      │
      ▼
SEED_EMAIL=…  pnpm db:seed             ← can be skipped with --no-seed
      │
      ▼
Print sign-in credentials
```

## Input — `seed-data.json` at repo root

Expected v1 shape (committed by the onboarding tool):

```json
{
  "version": 1,
  "client": {
    "name":              "Acme Corp",
    "slug":              "acme",
    "adminEmail":        "admin@acme.com",
    "adminFirstName":    "John",
    "adminLastName":     "Doe",
    "brandPrimaryColor": "#2563EB",
    "brandLogoUrl":      "https://cdn.acme.com/logo.png",
    "notes":             "Any free-form notes from onboarding"
  },
  "modules": [
    { "key": "users",           "enabled": true  },
    { "key": "roles",           "enabled": true  },
    { "key": "email-templates", "enabled": true  },
    { "key": "activity-logs",   "enabled": false },
    { "key": "api-logs",        "enabled": true  },
    { "key": "settings",        "enabled": true  },
    { "key": "dashboard",       "enabled": true  }
  ],
  "provisionedAt": "2026-04-18T14:22:00Z",
  "provisionedBy": "onboarding-bot"
}
```

The CLI also accepts fallback paths: `prisma/seed-data.json` and `.onboarding/seed-data.json`.

## What to do when this skill is invoked

1. **Pre-flight**
   - Confirm `package.json` + `scripts/apply-config.ts` exist at repo root. If not, explain this isn't a provisioned client repo.
   - Confirm `.env` exists (don't read contents — the protect-secrets hook blocks reads of `.env`). If missing, tell the user:
     ```
     Copy .env.example to .env and set IRON_SESSION_SECRET + DATABASE_URL before running this skill.
     ```
   - Locate the `seed-data.json` file. If absent, tell the user where it should live and stop.

2. **Preview**
   - Read the JSON. Show the user a short summary:
     ```
     Client:        Acme Corp
     Admin email:   admin@acme.com
     Brand color:   #2563EB
     Modules:       users ✓ · roles ✓ · email-templates ✓ · activity-logs ✗ · api-logs ✓ · settings ✓ · dashboard ✓
     ```
   - Ask for confirmation before running.

3. **Run**
   - Execute `pnpm apply:config` (not `apply:config:files-only` — human invocation wants the full pipeline including migrate + seed).
   - Stream output.

4. **Report**
   - On success, surface the sign-in block the CLI prints (email + temporary password).
   - Remind the user to run `pnpm dev` and visit `http://localhost:3000/login`.

## Pipeline modes (for the CLI directly, not the skill)

The CLI supports flags — the ProvisioningService uses these, not the skill:

| Flag                   | Behavior                                              | Used by                 |
|------------------------|-------------------------------------------------------|-------------------------|
| (none)                 | Full pipeline: files + migrate + seed                 | `/apply-onboarding`     |
| `--no-seed`            | Files + migrate, skip seed                            | —                       |
| `--no-migrate`         | Files only, skip migrate + seed                       | —                       |
| `--files-only`         | Alias of `--no-migrate --no-seed`                     | Pre-push CI in tmp dir  |

## Idempotency

All phases are safe to re-run:

- `lib/client-config.ts` — fully regenerated each run
- `app/globals.css` — brand block is identified by `BEGIN onboarding-brand` / `END onboarding-brand` markers and replaced in place
- `docs/client-notes.md` — regenerated if notes present; left alone if empty
- Migrations + seed — idempotent by design

## Non-goals

- Does **not** install npm packages.
- Does **not** touch `package.json`, `tsconfig.json`, `next.config.ts`, or `middleware.ts`.
- Does **not** create new DB tables — uses the existing 8 schemas.
- Does **not** deploy or build.

## Failure modes

| Symptom                          | Likely cause                                    | Fix                                                             |
|----------------------------------|-------------------------------------------------|-----------------------------------------------------------------|
| `No seed-data.json found`        | Run in wrong repo or onboarding didn't commit it | Check the file at repo root                                     |
| `Unsupported seed-data version`  | Onboarding tool emits v2 but skill only knows v1 | Upgrade the skill / CLI                                         |
| `drizzle-kit migrate` exits ≠ 0  | `DATABASE_URL` not set / schema conflict         | Check `.env` / delete `dev.db` and retry                        |
| `SEED_EMAIL already exists`      | Re-running on an already-seeded DB               | Expected — idempotent; seed prints `skip` and continues         |
| Hex → oklch warning              | `brandPrimaryColor` isn't `#RRGGBB`              | CLI falls back to project default; onboarding should validate   |
