import { test, expect } from '@playwright/test'
import { CronSyncPage } from '../../pages/CronSyncPage'

test.describe('Cron Sync module', () => {
  let cronPage: CronSyncPage

  test.beforeEach(({ page }) => {
    cronPage = new CronSyncPage(page)
  })

  test('list renders without error', async ({ page }) => {
    await cronPage.list()
    await expect(page.locator('table, [data-empty-state], text=No sync')).toBeVisible({ timeout: 10_000 })
  })

  test('cron-sync page has expected heading', async ({ page }) => {
    await cronPage.list()
    await expect(page.getByRole('heading', { name: /cron|sync schedule/i })).toBeVisible()
  })

  test('create cron job navigates to form', async ({ page }) => {
    await cronPage.list()
    const newLink = page.getByRole('link', { name: /new|add|\+/i }).first()
    if (await newLink.isVisible()) {
      await newLink.click()
      await expect(page).toHaveURL(/\/cron-sync\/new/)
    }
  })
})
