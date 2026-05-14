import { test, expect } from '@playwright/test'
import { AuthPage } from '../../pages/AuthPage'

test.describe('Reset Password', () => {
  let auth: AuthPage

  test.beforeEach(({ page }) => {
    auth = new AuthPage(page)
  })

  test('mismatched passwords show validation error', async ({ page }) => {
    // Use any token value — we expect validation to fail before hitting the API
    await page.goto('/reset-password?token=test-token-abc')
    const fields = page.getByRole('textbox')
    await fields.nth(0).fill('NewPass@1234')
    await fields.nth(1).fill('DifferentPass@1234')
    await page.getByRole('button', { name: /reset|set password/i }).click()

    const error = page.locator('[class*="text-destructive"], [role="alert"]').first()
    await expect(error).toBeVisible()
  })

  test('invalid or expired token shows error', async ({ page }) => {
    await page.goto('/reset-password?token=invalid-expired-token-xyz')
    const fields = page.getByRole('textbox')
    if (await fields.count() >= 2) {
      await fields.nth(0).fill('NewPass@1234')
      await fields.nth(1).fill('NewPass@1234')
      await page.getByRole('button', { name: /reset|set password/i }).click()
      // Expect an error state — either inline or a toast
      const error = page.locator('[class*="text-destructive"], [role="alert"], [data-sonner-toast]').first()
      await expect(error).toBeVisible({ timeout: 8_000 })
    } else {
      // Page may show error immediately without showing the form
      const error = page.locator('[class*="text-destructive"], [role="alert"]').first()
      await expect(error).toBeVisible()
    }
  })

  test('reset password page loads without token', async ({ page }) => {
    await page.goto('/reset-password')
    // Should show an error or redirect — not an unhandled exception
    await expect(page.locator('body')).not.toContainText('unhandled')
  })
})
