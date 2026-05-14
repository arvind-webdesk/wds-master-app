import { test, expect } from '@playwright/test'
import { AuthPage } from '../../pages/AuthPage'
import { SUPERADMIN_EMAIL } from '../../global-setup'

test.describe('Forgot Password', () => {
  let auth: AuthPage

  test.beforeEach(({ page }) => {
    auth = new AuthPage(page)
  })

  test('registered email shows confirmation', async ({ page }) => {
    await auth.forgotPassword(SUPERADMIN_EMAIL)
    // Confirmation message — should NOT redirect to login
    await expect(page.getByText(/sent|check your email|reset link/i)).toBeVisible({ timeout: 8_000 })
  })

  test('unknown email shows same confirmation (no enumeration)', async ({ page }) => {
    await auth.forgotPassword('notregistered@test.local')
    await expect(page.getByText(/sent|check your email|reset link/i)).toBeVisible({ timeout: 8_000 })
  })

  test('empty email shows validation error', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByRole('button', { name: /send|reset/i }).click()
    const error = page.locator('[class*="text-destructive"], [role="alert"]').first()
    await expect(error).toBeVisible()
  })
})
