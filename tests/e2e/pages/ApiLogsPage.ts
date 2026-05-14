import type { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'

export class ApiLogsPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async list() {
    await this.navigate('/api-logs')
    await this.page.waitForLoadState('networkidle')
  }

  async openDetail(rowIndex: number) {
    const rows = this.page.locator('table tbody tr')
    await rows.nth(rowIndex).click()
  }

  getTableRows(): Locator {
    return this.page.locator('table tbody tr')
  }
}
