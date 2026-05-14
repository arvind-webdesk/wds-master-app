## Context

The project is a Next.js App Router dashboard (SQLite via Drizzle, TypeScript, Tailwind v4, CASL-based RBAC). It has no automated E2E coverage today. Every feature — auth flows, CRUD for 8+ modules, role-gated access — is tested manually. The goal is to wire Playwright so every feature has a repeatable, reportable test.

There is no existing `.github/workflows/` directory and no test runner configured in `package.json`.

## Goals / Non-Goals

**Goals:**
- Install and configure `@playwright/test` with HTML reporter and trace-on-failure.
- Establish a Page Object Model (POM) directory structure under `tests/e2e/`.
- Cover all auth flows end-to-end (login, logout, forgot-password, reset-password).
- Cover all 8 dashboard modules with list, create, edit, delete, and search scenarios.
- Provide a shared `auth.setup.ts` that logs in once and reuses the browser session via `storageState`.
- Provide a global setup script that seeds a clean test database before the suite runs.
- Add `test:e2e` and `test:e2e:report` npm scripts.

**Non-Goals:**
- Unit or integration tests (those belong in Vitest/Jest, not this change).
- Visual regression / snapshot testing.
- Load or performance testing.
- GitHub Actions CI workflow (no `.github/` exists; instructions will be documented, not wired).
- Testing third-party OAuth flows (Shopify OAuth callback is excluded).

## Decisions

### 1. Page Object Model over raw `page` calls
**Decision:** Encapsulate every page's selectors and actions in a POM class under `tests/e2e/pages/`.
**Rationale:** POM keeps specs readable and centralises selector maintenance. When a form field label changes, one POM file changes, not 10 test files.
**Alternative considered:** Inline selectors in each test — rejected because it creates high copy-paste duplication and fragile tests.

### 2. Shared auth fixture via `storageState`
**Decision:** A dedicated `auth.setup.ts` project runs first, logs in as superadmin, and saves `tests/e2e/.auth/superadmin.json`. All authenticated test projects load this `storageState`.
**Rationale:** Avoids re-logging in for every test file (slow, flaky). Playwright's `projects` + `dependencies` config makes this composable.
**Alternative considered:** Login in `beforeEach` — rejected because it hits the auth API N times and adds 500–2000 ms per test.

### 3. Separate test database (`test.db`)
**Decision:** Global setup script copies or recreates a fresh `test.db` from the Drizzle schema and seeds it with known fixture data before the suite starts. `playwright.config.ts` sets `DATABASE_URL=test.db` via `process.env`.
**Rationale:** Tests must not pollute `dev.db`. Seeding a predictable state means assertions can use exact values (e.g., "expect 3 users").
**Alternative considered:** Mocking the DB at the API layer — rejected because it makes tests superficial and doesn't catch query bugs.

### 4. `webServer` in `playwright.config.ts`
**Decision:** Use Playwright's built-in `webServer` option to start `next dev` automatically before tests run.
**Rationale:** Zero manual steps — `pnpm test:e2e` is the single command.
**Alternative considered:** Require the developer to start the server manually — rejected because it adds friction and causes flaky "connection refused" failures in CI.

### 5. HTML reporter + trace viewer
**Decision:** Use `reporter: [['html', { open: 'never' }]]` in CI and `['list']` locally. Traces are captured on first retry (`trace: 'on-first-retry'`).
**Rationale:** HTML report is self-contained (no external service), sharable, and shows screenshots + traces inline. `on-first-retry` keeps trace files small on passing runs.

## Risks / Trade-offs

- **SQLite file locking** → Playwright runs workers in parallel by default. Concurrent writes to `test.db` can deadlock. Mitigation: set `workers: 1` in the config (or `fullyParallel: false`) until the test count justifies parallelism, or use WAL mode (`PRAGMA journal_mode=WAL`).
- **`next dev` startup time** → Cold start can take 5–10 s, causing the first test to time out. Mitigation: set `webServer.timeout` to 60 000 ms and `reuseExistingServer: true` for local runs.
- **Test data coupling** → Tests that assume specific IDs or order of records are fragile. Mitigation: always create fixtures in `beforeAll`/`beforeEach` and delete them in `afterAll`, or use unique names with `Date.now()` suffix.
- **Auth token expiry** → If tests run > session TTL, the reused `storageState` becomes invalid. Mitigation: refresh `auth.setup.ts` as a Playwright `dependencies` project that always runs first and is short-lived.

## Migration Plan

1. Install `@playwright/test` and download browsers once (`pnpm exec playwright install --with-deps chromium`).
2. Add `playwright.config.ts` at repo root.
3. Create `tests/e2e/` directory tree: `pages/`, `fixtures/`, `specs/`, `.auth/` (gitignored).
4. Add global setup (`tests/e2e/global-setup.ts`) that seeds `test.db`.
5. Add `auth.setup.ts`.
6. Add POM classes one module at a time.
7. Add spec files.
8. Wire `package.json` scripts.
9. Add `.gitignore` entries for `test-results/`, `playwright-report/`, `tests/e2e/.auth/`.

No rollback needed — all changes are additive (new files + a dev dependency). Removing Playwright is `pnpm remove @playwright/test` + delete `tests/e2e/` and `playwright.config.ts`.

## Open Questions

- Should tests run against a built (`next build && next start`) server in CI for production-parity, or against `next dev` for speed? (Recommended: `next dev` initially, upgrade to `next start` if flakiness appears.)
- Are there any seed users beyond superadmin needed (e.g., a viewer-role user) to test CASL-gated UI states?
