import type { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'

export class SyncHistoryPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async list() {
    await this.navigate('/sync-history')
    await this.page.waitForLoadState('networkidle')
  }

  getTableRows(): Locator {
    return this.page.locator('table tbody tr')
  }

  getStatusBadges(): Locator {
    return this.page.locator('[data-status], .badge, [class*="badge"]')
  }
}
