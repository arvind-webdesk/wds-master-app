import type { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class ActivityLogsPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async list() {
    await this.navigate('/activity-logs')
    await this.page.waitForLoadState('networkidle')
  }

  async filterByUser(name: string) {
    const filter = this.page.getByPlaceholder(/search|filter/i).first()
    if (await filter.count() === 0) return
    await filter.fill(name)
    await this.page.waitForTimeout(500)
  }

  getTableRows() {
    return this.page.locator('table tbody tr')
  }
}
