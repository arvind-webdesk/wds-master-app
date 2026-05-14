import { test, expect } from '@playwright/test'
import { RolesPage } from '../../pages/RolesPage'

test.describe('Roles module', () => {
  let rolesPage: RolesPage

  test.beforeEach(({ page }) => {
    rolesPage = new RolesPage(page)
  })

  test('list renders seeded roles', async ({ page }) => {
    await rolesPage.list()
    await expect(page.getByText('superadmin')).toBeVisible()
    await expect(page.getByText('viewer')).toBeVisible()
  })

  test('create role navigates to form', async ({ page }) => {
    await rolesPage.list()
    const newLink = page.getByRole('link', { name: /new role|\+ new/i }).first()
    await expect(newLink).toBeVisible()
    await newLink.click()
    await expect(page).toHaveURL(/\/roles\/new/)
  })

  test('create role with valid name', async ({ page }) => {
    const timestamp = Date.now()
    await rolesPage.create({
      name: `Test Role ${timestamp}`,
      description: 'Created by E2E test',
    })
    // After successful create, should leave /new
    await expect(page).not.toHaveURL(/\/roles\/new/)
  })
})
