## 1. Install and Configure Playwright

- [x] 1.1 Add `@playwright/test` as a dev dependency (`pnpm add -D @playwright/test`)
- [x] 1.2 Run `pnpm exec playwright install --with-deps chromium` to download the Chromium browser binary
- [x] 1.3 Create `playwright.config.ts` at repo root with `webServer` (pointing at `pnpm dev`), HTML reporter, `trace: 'on-first-retry'`, `workers: 1`, and Chromium project
- [x] 1.4 Add `test:e2e`, `test:e2e:ui`, and `test:e2e:report` scripts to `package.json`
- [x] 1.5 Add `playwright-report/`, `test-results/`, `tests/e2e/.auth/`, and `test.db` to `.gitignore`

## 2. Global Setup — Test Database

- [x] 2.1 Create `tests/e2e/global-setup.ts` that sets `process.env` to point at `test.db` and runs Drizzle migrations via `drizzle-kit migrate`
- [x] 2.2 Seed `test.db` in global setup: create superadmin role + user, a viewer role + user, and minimal sample records for connections, cron jobs, and email templates
- [x] 2.3 Register `globalSetup` in `playwright.config.ts`

## 3. Auth Setup Fixture

- [x] 3.1 Create `tests/e2e/auth.setup.ts` that navigates to `/login`, logs in as superadmin, and saves `storageState` to `tests/e2e/.auth/superadmin.json`
- [x] 3.2 Create a second `tests/e2e/auth.setup.viewer.ts` that logs in as the viewer-role user and saves `tests/e2e/.auth/viewer.json`
- [x] 3.3 Add `setup` and `setup-viewer` Playwright projects to `playwright.config.ts`; make the main test project depend on both

## 4. Page Object Models

- [x] 4.1 Create `tests/e2e/pages/BasePage.ts` with common helpers (`navigate`, `waitForToast`, `confirmDialog`)
- [x] 4.2 Create `tests/e2e/pages/AuthPage.ts` with `login(email, password)`, `logout()`, `forgotPassword(email)`, `resetPassword(token, password, confirm)` methods
- [x] 4.3 Create `tests/e2e/pages/UsersPage.ts` with `list()`, `create(data)`, `edit(id, data)`, `search(query)`, `delete(id)` methods
- [x] 4.4 Create `tests/e2e/pages/RolesPage.ts` with `list()`, `create(data)`, `togglePermission(role, module, action)`, `edit(id, data)` methods
- [x] 4.5 Create `tests/e2e/pages/ConnectionsPage.ts` with `list()`, `create(data)`, `test(id)`, `delete(id)` methods
- [x] 4.6 Create `tests/e2e/pages/CronSyncPage.ts` with `list()`, `create(data)`, `runNow(id)`, `delete(id)` methods
- [x] 4.7 Create `tests/e2e/pages/EmailTemplatesPage.ts` with `list()`, `create(data)`, `edit(id, data)`, `delete(id)` methods
- [x] 4.8 Create `tests/e2e/pages/SettingsPage.ts` with `setValue(key, value)`, `save()` methods
- [x] 4.9 Create `tests/e2e/pages/ActivityLogsPage.ts` with `list()`, `filterByUser(name)` methods
- [x] 4.10 Create `tests/e2e/pages/ApiLogsPage.ts` with `list()`, `openDetail(row)` methods
- [x] 4.11 Create `tests/e2e/pages/SyncHistoryPage.ts` with `list()` method
- [x] 4.12 Create `tests/e2e/pages/DashboardPage.ts` with `navigate()` and `getMetricCards()` methods

## 5. Auth Flow Specs

- [x] 5.1 Create `tests/e2e/specs/auth/login.spec.ts` — successful login, wrong password, unknown email, empty field validation
- [x] 5.2 Create `tests/e2e/specs/auth/logout.spec.ts` — verifies session is cleared and protected routes redirect to `/login`
- [x] 5.3 Create `tests/e2e/specs/auth/forgot-password.spec.ts` — valid email, unknown email (no enumeration), empty email validation
- [x] 5.4 Create `tests/e2e/specs/auth/reset-password.spec.ts` — valid token, mismatched passwords, invalid/expired token
- [x] 5.5 Create `tests/e2e/specs/auth/redirect.spec.ts` — unauthenticated access to `/dashboard` redirects to `/login`

## 6. Dashboard Module Specs

- [x] 6.1 Create `tests/e2e/specs/dashboard/dashboard.spec.ts` — renders without errors, metric widgets visible
- [x] 6.2 Create `tests/e2e/specs/modules/users.spec.ts` — list renders seeded users, create, edit, search
- [x] 6.3 Create `tests/e2e/specs/modules/roles.spec.ts` — list renders seeded roles, create with permissions, edit name
- [x] 6.4 Create `tests/e2e/specs/modules/connections.spec.ts` — list, create, test connection, delete
- [x] 6.5 Create `tests/e2e/specs/modules/cron-sync.spec.ts` — list, create, run now, delete
- [x] 6.6 Create `tests/e2e/specs/modules/email-templates.spec.ts` — list, create, edit, delete
- [x] 6.7 Create `tests/e2e/specs/modules/settings.spec.ts` — renders seeded settings, update value persists on reload
- [x] 6.8 Create `tests/e2e/specs/modules/activity-logs.spec.ts` — list renders records, filter by user
- [x] 6.9 Create `tests/e2e/specs/modules/api-logs.spec.ts` — list renders records, click row shows detail
- [x] 6.10 Create `tests/e2e/specs/modules/sync-history.spec.ts` — list renders records, status badges visible

## 7. CASL / Role-Gated Access Specs

- [x] 7.1 Create `tests/e2e/specs/access/viewer-restrictions.spec.ts` — viewer cannot access `/users`, create/edit/delete actions are hidden on allowed modules

## 8. Verify and Polish

- [ ] 8.1 Run `pnpm test:e2e` and confirm all specs pass against the seeded test database
- [ ] 8.2 Open `pnpm test:e2e:report` and verify the HTML report shows pass/fail status and traces for any failures
- [x] 8.3 Run `pnpm typecheck` to ensure all POM classes and spec files are type-correct
- [x] 8.4 Add a `## Running E2E Tests` section to the project README (or create `docs/e2e-testing.md`) documenting the one-time setup and the three npm scripts
