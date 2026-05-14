import { test, expect } from '@playwright/test'

test.describe('Settings module', () => {
  test('settings page renders without error', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
  })

  test('seeded site_name setting is visible', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('site_name').or(page.locator('[value="WDS Test"]'))).toBeVisible({ timeout: 8_000 })
  })
})
