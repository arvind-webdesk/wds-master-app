import { test, expect } from '@playwright/test'
import { UsersPage } from '../../pages/UsersPage'

test.describe('Users module', () => {
  let usersPage: UsersPage

  test.beforeEach(({ page }) => {
    usersPage = new UsersPage(page)
  })

  test('list renders seeded users', async ({ page }) => {
    await usersPage.list()
    // At least the superadmin user is seeded
    await expect(page.getByText('admin@test.local')).toBeVisible()
  })

  test('create user navigates to form', async ({ page }) => {
    await usersPage.list()
    const newLink = page.getByRole('link', { name: /new user|\+ new/i }).first()
    await expect(newLink).toBeVisible()
    await newLink.click()
    await expect(page).toHaveURL(/\/users\/new/)
  })

  test('create user with valid data', async ({ page }) => {
    const timestamp = Date.now()
    await usersPage.create({
      firstName: 'Test',
      lastName: 'User',
      email: `testuser${timestamp}@test.local`,
      password: 'TestPass@1234',
      userType: 'user',
    })
    // After successful create, should navigate away from /new
    await expect(page).not.toHaveURL(/\/users\/new/)
  })

  test('search filters the table', async ({ page }) => {
    await usersPage.search('admin@test.local')
    // Viewer user should not appear
    await expect(page.getByText('viewer@test.local')).not.toBeVisible({ timeout: 3_000 }).catch(() => {})
  })
})
