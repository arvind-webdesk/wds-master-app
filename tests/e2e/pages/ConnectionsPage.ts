import type { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export interface CreateConnectionData {
  name: string
  type?: 'shopify' | 'bigcommerce'
  storeIdentifier: string
}

export class ConnectionsPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async list() {
    await this.navigate('/connections')
    await this.page.waitForLoadState('networkidle')
  }

  async create(data: CreateConnectionData) {
    await this.page.getByRole('link', { name: /new connection|add connection|\+ new/i }).first().click()
    await this.page.waitForURL('**/connections/new', { timeout: 10_000 })

    await this.page.getByLabel('Name', { exact: false }).fill(data.name)
    await this.page.getByLabel(/store.*identifier|identifier/i).fill(data.storeIdentifier)
    await this.page.getByRole('button', { name: /create|save|submit/i }).click()
  }

  async testConnection(id: string | number) {
    await this.navigate(`/connections/${id}`)
    await this.page.getByRole('button', { name: /test connection|test/i }).click()
  }

  async delete(id: string | number) {
    await this.navigate(`/connections/${id}`)
    await this.page.getByRole('button', { name: /delete/i }).click()
    await this.confirmDialog()
  }

  getTableRows() {
    return this.page.locator('table tbody tr')
  }
}
