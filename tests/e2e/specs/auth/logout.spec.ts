import { test, expect } from '@playwright/test'
import { AuthPage } from '../../pages/AuthPage'
import { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } from '../../global-setup'

test.describe('Logout', () => {
  test('logout clears session and redirects to login', async ({ page }) => {
    const auth = new AuthPage(page)

    // Login first
    await auth.login(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    await expect(page).toHaveURL(/\/dashboard/)

    // Navigate to logout endpoint directly (most reliable)
    await page.goto('/api/auth/logout')
    await page.waitForURL(/\/login/, { timeout: 10_000 })

    // Verify protected route redirects back to login
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})
