import { test, expect } from '@playwright/test'
import { DashboardPage } from '../../pages/DashboardPage'

test.describe('Dashboard home', () => {
  test('renders without errors', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.navigate()

    // No error messages on page
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
    await expect(page.locator('text=500')).not.toBeVisible()
  })

  test('shows at least one card or widget', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.navigate()

    const cards = dashboard.getMetricCards()
    await expect(cards.first()).toBeVisible()
  })
})
