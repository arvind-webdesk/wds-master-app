import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class BasePage {
  constructor(protected readonly page: Page) {}

  async navigate(path: string) {
    await this.page.goto(path)
  }

  async waitForToast(text: string | RegExp, timeout = 8_000) {
    await expect(this.page.locator('[data-sonner-toast]').filter({ hasText: text })).toBeVisible({ timeout })
  }

  async confirmDialog() {
    // AlertDialog — click the confirm/continue button (not Cancel)
    const dialog = this.page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button').filter({ hasNot: this.page.getByText(/cancel/i) }).last().click()
  }

  async waitForTableRows(timeout = 10_000): Promise<Locator> {
    const rows = this.page.locator('table tbody tr')
    await rows.first().waitFor({ timeout })
    return rows
  }

  async getTableRowCount(): Promise<number> {
    return this.page.locator('table tbody tr').count()
  }
}
