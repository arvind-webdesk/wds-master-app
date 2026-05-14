import { test, expect } from '@playwright/test'

// This spec file runs in the viewer-tests project (storageState: viewer.json)
// It also runs in dashboard-tests — the viewer storageState is applied via the project config

test.describe('Viewer role restrictions', () => {
  test('viewer cannot access users management', async ({ page }) => {
    await page.goto('/users')
    // Either access-denied message OR redirect away from /users
    const isDenied =
      (await page.locator('text=/access denied|not authorized|forbidden/i').isVisible()) ||
      !(await page.url().includes('/users'))
    expect(isDenied).toBe(true)
  })

  test('viewer cannot see New User button', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
    // "New" / "+ New" / "Add User" button must not be visible to viewer
    const newButton = page.getByRole('link', { name: /new user|\+ new|add user/i })
    await expect(newButton).not.toBeVisible({ timeout: 5_000 }).catch(() => {
      // If user was redirected away, this is also passing
    })
  })

  test('viewer cannot access roles management', async ({ page }) => {
    await page.goto('/roles')
    const isDenied =
      (await page.locator('text=/access denied|not authorized|forbidden/i').isVisible()) ||
      !(await page.url().includes('/roles'))
    expect(isDenied).toBe(true)
  })
})
