import { test, expect } from '@playwright/test'
import { SyncHistoryPage } from '../../pages/SyncHistoryPage'

test.describe('Sync History module', () => {
  test('sync-history page renders', async ({ page }) => {
    const syncHistory = new SyncHistoryPage(page)
    await syncHistory.list()
    await expect(page.getByRole('heading', { name: /sync.*history|history/i })).toBeVisible()
  })

  test('table or empty state is visible', async ({ page }) => {
    const syncHistory = new SyncHistoryPage(page)
    await syncHistory.list()
    await expect(
      page.locator('table').or(page.getByText(/no.*sync|no records/i))
    ).toBeVisible({ timeout: 10_000 })
  })
})
