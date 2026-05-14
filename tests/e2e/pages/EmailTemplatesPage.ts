import type { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export interface CreateTemplateData {
  title: string
  code: string
  subject: string
  body: string
}

export class EmailTemplatesPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async list() {
    await this.navigate('/email-templates')
    await this.page.waitForLoadState('networkidle')
  }

  async create(data: CreateTemplateData) {
    await this.page.getByRole('link', { name: /new template|add template|\+ new/i }).first().click()
    await this.page.waitForURL('**/email-templates/new', { timeout: 10_000 })

    await this.page.getByLabel('Title', { exact: false }).fill(data.title)
    await this.page.getByLabel('Code', { exact: false }).fill(data.code)
    await this.page.getByLabel('Subject', { exact: false }).fill(data.subject)
    const bodyField = this.page.getByLabel('Body', { exact: false })
    if (await bodyField.count() > 0) {
      await bodyField.fill(data.body)
    }
    await this.page.getByRole('button', { name: /create|save|submit/i }).click()
  }

  async edit(id: string | number, data: Partial<CreateTemplateData>) {
    await this.navigate(`/email-templates/${id}`)
    await this.page.waitForLoadState('networkidle')

    if (data.subject) {
      const field = this.page.getByLabel('Subject', { exact: false })
      await field.clear()
      await field.fill(data.subject)
    }
    await this.page.getByRole('button', { name: /save|update/i }).click()
  }

  async delete(id: string | number) {
    await this.navigate(`/email-templates`)
    const row = this.page.locator(`tr:has([href*="/email-templates/${id}"])`).first()
    await row.getByRole('button', { name: /delete/i }).click()
    await this.confirmDialog()
  }

  getTableRows() {
    return this.page.locator('table tbody tr')
  }
}
