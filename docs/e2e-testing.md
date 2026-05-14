## Running E2E Tests

### One-time setup

Install the Playwright Chromium browser binary:

```bash
pnpm exec playwright install --with-deps chromium
```

### Running tests

```bash
# Run the full suite headlessly (seeds test.db automatically)
pnpm test:e2e

# Open Playwright UI mode for interactive debugging
pnpm test:e2e:ui

# Open the last HTML report
pnpm test:e2e:report
```

### How it works

- **Test database**: Tests use a separate `test.db` (never `dev.db`). It is created, migrated, and seeded automatically by `tests/e2e/global-setup.ts` before the suite starts.
- **Auth**: `auth.setup.ts` logs in as superadmin and saves the session to `tests/e2e/.auth/superadmin.json`. Dashboard tests reuse this session without re-logging in.
- **Test credentials**:
  - Superadmin: `admin@test.local` / `Admin@1234`
  - Viewer: `viewer@test.local` / `Viewer@1234`
- **Reports**: HTML reports are written to `playwright-report/`. Run `pnpm test:e2e:report` to open the last one.

### File layout

```
tests/e2e/
  global-setup.ts          # DB migration + seeding
  auth.setup.ts            # Superadmin session fixture
  auth.setup.viewer.ts     # Viewer session fixture
  pages/                   # Page Object Models
  specs/
    auth/                  # Login, logout, forgot/reset password
    dashboard/             # Dashboard home
    modules/               # Users, Roles, Connections, Cron Sync, etc.
    access/                # CASL role-gated access tests
```
