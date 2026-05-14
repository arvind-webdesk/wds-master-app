import { test, expect } from '@playwright/test'

test.describe('Unauthenticated redirect', () => {
  test('navigating to /dashboard without session redirects to /login', async ({ page }) => {
    // This test runs with no storageState — fresh browser context
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('navigating to /users without session redirects to /login', async ({ page }) => {
    await page.goto('/users')
    await expect(page).toHaveURL(/\/login/)
  })

  test('navigating to /roles without session redirects to /login', async ({ page }) => {
    await page.goto('/roles')
    await expect(page).toHaveURL(/\/login/)
  })
})
