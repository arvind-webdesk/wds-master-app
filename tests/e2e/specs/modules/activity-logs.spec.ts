import { test, expect } from '@playwright/test'
import { ActivityLogsPage } from '../../pages/ActivityLogsPage'

test.describe('Activity Logs module', () => {
  test('activity logs page renders', async ({ page }) => {
    const logsPage = new ActivityLogsPage(page)
    await logsPage.list()
    await expect(page.getByRole('heading', { name: /activity|logs/i })).toBeVisible()
  })

  test('table or empty state is visible', async ({ page }) => {
    const logsPage = new ActivityLogsPage(page)
    await logsPage.list()
    await expect(
      page.locator('table').or(page.getByText(/no activity|no logs|no records/i))
    ).toBeVisible({ timeout: 10_000 })
  })
})
