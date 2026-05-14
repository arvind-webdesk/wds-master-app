import type { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'

export class DashboardPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async navigate() {
    await this.page.goto('/dashboard')
    await this.page.waitForLoadState('networkidle')
  }

  getMetricCards(): Locator {
    return this.page.locator('[class*="card"], [data-card]')
  }
}
