## Why

The project has no automated end-to-end test coverage, meaning regressions in auth flows, CRUD operations, or role-based access can only be caught manually. Adding Playwright E2E tests gives the team a reliable, repeatable suite that runs against every feature and produces HTML reports for visibility.

## What Changes

- Install and configure Playwright as a dev dependency with HTML reporter and trace support.
- Add a `tests/e2e/` directory containing page-object models and spec files for every feature.
- Cover all auth flows: login, logout, forgot-password, reset-password.
- Cover all dashboard modules: Users, Roles, Connections, Cron Sync, Email Templates, Settings, Activity Logs, API Logs, Sync History.
- Add shared fixtures for authenticated sessions and database seeding so tests are isolated and repeatable.
- Wire an npm script (`pnpm test:e2e`) and a GitHub Actions workflow step that uploads the HTML report as a build artifact.

## Capabilities

### New Capabilities

- `e2e-test-infrastructure`: Playwright config, global setup/teardown, shared fixtures, page-object base class, and CI workflow integration.
- `e2e-auth-flows`: End-to-end tests for login, logout, forgot-password, and reset-password including validation error states.
- `e2e-dashboard-modules`: End-to-end tests for every dashboard module — list views, create/edit/delete record flows, search/filter, and CASL-gated access for different roles.

### Modified Capabilities

## Impact

- New dev dependency: `@playwright/test` + browser binaries.
- New directory: `tests/e2e/` (page objects + spec files).
- New config: `playwright.config.ts` at repo root.
- New npm scripts in `package.json`: `test:e2e`, `test:e2e:ui`, `test:e2e:report`.
- New GitHub Actions job (if `.github/workflows/` exists) or instructions to add one.
- Requires a running dev server or `webServer` config pointing at `pnpm dev`.
- No changes to existing application code.
