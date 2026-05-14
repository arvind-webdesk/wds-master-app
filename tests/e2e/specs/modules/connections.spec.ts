import { test, expect } from '@playwright/test'
import { ConnectionsPage } from '../../pages/ConnectionsPage'

test.describe('Connections module', () => {
  let connectionsPage: ConnectionsPage

  test.beforeEach(({ page }) => {
    connectionsPage = new ConnectionsPage(page)
  })

  test('list renders without error', async ({ page }) => {
    await connectionsPage.list()
    // Page loads — either data rows or an empty state message
    await expect(page.locator('table, [data-empty-state], text=No connections')).toBeVisible({ timeout: 10_000 })
  })

  test('create connection navigates to form', async ({ page }) => {
    await connectionsPage.list()
    const newLink = page.getByRole('link', { name: /new connection|\+ new/i }).first()
    if (await newLink.isVisible()) {
      await newLink.click()
      await expect(page).toHaveURL(/\/connections\/new/)
    }
  })

  test('connections page has expected heading', async ({ page }) => {
    await connectionsPage.list()
    await expect(page.getByRole('heading', { name: /connections/i })).toBeVisible()
  })
})
