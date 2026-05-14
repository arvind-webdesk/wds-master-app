## ADDED Requirements

### Requirement: Playwright is installed and configured
The project SHALL have `@playwright/test` as a dev dependency with a root-level `playwright.config.ts` that targets Chromium, uses the HTML reporter, captures traces on first retry, and auto-starts the Next.js dev server via `webServer`.

#### Scenario: Running the full suite from scratch
- **WHEN** a developer runs `pnpm test:e2e` with no server already running
- **THEN** Playwright starts the Next.js dev server automatically, executes all specs, and exits with code 0 on pass / non-zero on failure

#### Scenario: HTML report is generated after every run
- **WHEN** the test suite finishes (pass or fail)
- **THEN** a self-contained HTML report is written to `playwright-report/` containing test results, durations, and failure screenshots

### Requirement: Page Object Model structure exists
The project SHALL have a `tests/e2e/pages/` directory containing one POM class per page or major UI section. Each POM class SHALL expose typed action methods (e.g., `login(email, password)`) and assertion helpers, never raw `page.locator` calls in spec files.

#### Scenario: Auth POM is used in an auth spec
- **WHEN** an auth spec file is executed
- **THEN** it calls `authPage.login(email, password)` and the POM handles all selector interaction internally

#### Scenario: Module POM exposes a create method
- **WHEN** a module spec calls `usersPage.createUser(data)`
- **THEN** the POM fills the form, submits it, and returns without exposing raw selectors to the test

### Requirement: Shared authenticated session fixture
The project SHALL have an `auth.setup.ts` Playwright project that logs in as the superadmin, saves `storageState` to `tests/e2e/.auth/superadmin.json`, and is declared as a dependency for all dashboard test projects.

#### Scenario: Auth setup runs before dashboard tests
- **WHEN** Playwright resolves the project dependency graph
- **THEN** `auth.setup` completes before any dashboard spec file begins

#### Scenario: Saved auth state is reused
- **WHEN** a dashboard spec file starts
- **THEN** the browser context is pre-authenticated and no login UI is shown

### Requirement: Global setup seeds a test database
The project SHALL have a `tests/e2e/global-setup.ts` script that sets `DATABASE_URL` (or equivalent env var) to `test.db`, runs Drizzle migrations, and seeds known fixture data (superadmin user, at least one viewer-role user, sample records for each module) before any test runs.

#### Scenario: Test database is clean at suite start
- **WHEN** global setup completes
- **THEN** `test.db` contains exactly the seeded fixture data and no leftover records from a previous run

#### Scenario: Application reads test database during tests
- **WHEN** Playwright tests make requests that trigger database queries
- **THEN** all reads and writes go to `test.db`, not `dev.db`

### Requirement: npm scripts expose test commands
`package.json` SHALL include:
- `test:e2e` — runs the full suite headlessly
- `test:e2e:ui` — opens the Playwright UI mode
- `test:e2e:report` — opens the last HTML report

#### Scenario: Developer runs tests headlessly
- **WHEN** `pnpm test:e2e` is executed
- **THEN** browsers launch without a visible window and results are printed to stdout

#### Scenario: Developer inspects the report
- **WHEN** `pnpm test:e2e:report` is executed
- **THEN** the Playwright HTML report opens in the default browser

### Requirement: Generated artifacts are gitignored
`tests/e2e/.auth/`, `playwright-report/`, `test-results/`, and `test.db` SHALL be listed in `.gitignore`.

#### Scenario: Auth tokens are not committed
- **WHEN** `git status` is run after tests
- **THEN** `tests/e2e/.auth/superadmin.json` does not appear as an untracked file
