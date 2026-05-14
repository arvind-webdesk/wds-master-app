import { test, expect } from '@playwright/test'
import { ApiLogsPage } from '../../pages/ApiLogsPage'

test.describe('API Logs module', () => {
  test('api-logs page renders', async ({ page }) => {
    const apiLogs = new ApiLogsPage(page)
    await apiLogs.list()
    await expect(page.getByRole('heading', { name: /api.*log|log/i })).toBeVisible()
  })

  test('table or empty state is visible', async ({ page }) => {
    const apiLogs = new ApiLogsPage(page)
    await apiLogs.list()
    await expect(
      page.locator('table').or(page.getByText(/no.*log|no records/i))
    ).toBeVisible({ timeout: 10_000 })
  })
})
