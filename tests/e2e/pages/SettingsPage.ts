import type { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export class SettingsPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async list() {
    await this.navigate('/settings')
    await this.page.waitForLoadState('networkidle')
  }

  async setValue(key: string, value: string) {
    await this.navigate('/settings')
    await this.page.waitForLoadState('networkidle')

    // Find the row/field for this key and update its value
    const keyRow = this.page.locator(`[data-key="${key}"], tr:has-text("${key}")`).first()
    const input = keyRow.locator('input, textarea').first()
    await input.clear()
    await input.fill(value)
  }

  async save() {
    await this.page.getByRole('button', { name: /save|update/i }).click()
    await this.waitForToast(/saved|updated/i)
  }
}
