import type { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export interface CreateCronJobData {
  connectionId?: string | number
  target?: 'products' | 'orders' | 'customers'
  cronExpression?: string
}

export class CronSyncPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async list() {
    await this.navigate('/cron-sync')
    await this.page.waitForLoadState('networkidle')
  }

  async create(data: CreateCronJobData) {
    await this.page.getByRole('link', { name: /new.*cron|add.*cron|\+ new/i }).first().click()
    await this.page.waitForURL('**/cron-sync/new', { timeout: 10_000 })

    if (data.cronExpression) {
      await this.page.getByLabel(/cron expression|schedule/i).fill(data.cronExpression)
    }
    await this.page.getByRole('button', { name: /create|save|submit/i }).click()
  }

  async runNow(id: string | number) {
    await this.navigate('/cron-sync')
    await this.page.locator(`[data-id="${id}"] button[aria-label*="run"], [data-id="${id}"] [title*="run"]`).first().click()
  }

  async delete(id: string | number) {
    await this.navigate('/cron-sync')
    const row = this.page.locator(`tr:has([href*="/cron-sync/${id}"])`).first()
    await row.getByRole('button', { name: /delete/i }).click()
    await this.confirmDialog()
  }

  getTableRows() {
    return this.page.locator('table tbody tr')
  }
}
