import type { Page } from '@playwright/test'
import { BasePage } from './BasePage'

export interface CreateRoleData {
  name: string
  description?: string
}

export class RolesPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async list() {
    await this.navigate('/roles')
    await this.page.waitForLoadState('networkidle')
  }

  async create(data: CreateRoleData) {
    await this.page.getByRole('link', { name: /new role|add role|\+ new/i }).first().click()
    await this.page.waitForURL('**/roles/new')

    await this.page.getByLabel('Name', { exact: false }).fill(data.name)
    if (data.description) {
      await this.page.getByLabel('Description', { exact: false }).fill(data.description)
    }
    await this.page.getByRole('button', { name: /create|save|submit/i }).click()
  }

  async edit(id: string | number, data: Partial<CreateRoleData>) {
    await this.navigate(`/roles/${id}`)
    await this.page.waitForLoadState('networkidle')

    if (data.name) {
      const field = this.page.getByLabel('Name', { exact: false })
      await field.clear()
      await field.fill(data.name)
    }
    await this.page.getByRole('button', { name: /save|update/i }).click()
  }

  async togglePermission(module: string, action: string) {
    // Permission matrix checkbox — locate by module+action data attributes or label
    const checkbox = this.page.locator(`[data-module="${module}"][data-action="${action}"] input[type="checkbox"], input[id="${module}-${action}"]`).first()
    await checkbox.click()
  }

  getTableRows() {
    return this.page.locator('table tbody tr')
  }
}
