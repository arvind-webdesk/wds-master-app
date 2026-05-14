import { test, expect } from '@playwright/test'
import { AuthPage } from '../../pages/AuthPage'
import { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } from '../../global-setup'

test.describe('Login', () => {
  let auth: AuthPage

  test.beforeEach(({ page }) => {
    auth = new AuthPage(page)
  })

  test('successful login redirects to dashboard', async ({ page }) => {
    await auth.login(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('wrong password shows error', async ({ page }) => {
    await auth.login(SUPERADMIN_EMAIL, 'wrong-password')
    await expect(page).toHaveURL(/\/login/)
    await expect(auth.getRootError()).toBeVisible()
  })

  test('unknown email shows error', async ({ page }) => {
    await auth.login('nobody@nowhere.com', 'somepassword')
    await expect(page).toHaveURL(/\/login/)
    await expect(auth.getRootError()).toBeVisible()
  })

  test('empty fields show validation errors', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /sign in/i }).click()
    // At least one field error or root error should be visible
    const errors = page.locator('[class*="text-destructive"], [role="alert"]')
    await expect(errors.first()).toBeVisible()
  })
})
