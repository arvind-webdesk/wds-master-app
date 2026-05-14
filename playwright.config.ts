import { defineConfig, devices } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  globalSetup: './tests/e2e/global-setup.ts',

  projects: [
    // Auth setup projects run first
    {
      name: 'setup-superadmin',
      testMatch: /tests\/e2e\/auth\.setup\.ts/,
    },
    {
      name: 'setup-viewer',
      testMatch: /tests\/e2e\/auth\.setup\.viewer\.ts/,
    },

    // Auth flow tests (no stored auth state needed — they test login themselves)
    {
      name: 'auth-tests',
      testMatch: /specs\/auth\/.*/,
      use: { ...devices['Desktop Chrome'] },
    },

    // Dashboard tests — depend on both auth setups
    {
      name: 'dashboard-tests',
      testMatch: /specs\/(dashboard|modules|access)\/.*/,
      dependencies: ['setup-superadmin', 'setup-viewer'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: './tests/e2e/.auth/superadmin.json',
      },
    },

    // Viewer-role tests
    {
      name: 'viewer-tests',
      testMatch: /specs\/access\/.*/,
      dependencies: ['setup-superadmin', 'setup-viewer'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: './tests/e2e/.auth/viewer.json',
      },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: 'file:./test.db',
    },
  },
})
