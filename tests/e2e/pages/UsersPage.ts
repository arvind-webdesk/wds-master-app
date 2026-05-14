import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { BasePage } from './BasePage'

export interface CreateUserData {
  firstName: string
  lastName: string
  email: string
  password: string
  userType?: 'superadmin' | 'admin' | 'user'
  status?: 'active' | 'inactive'
}

export class UsersPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async list() {
    await this.navigate('/users')
    await this.page.waitForLoadState('networkidle')
  }

  async create(data: CreateUserData) {
    await this.page.getByRole('link', { name: /new user|add user|\+ new/i }).first().click()
    await this.page.waitForURL('**/users/new')

    await this.page.getByLabel('First name', { exact: false }).fill(data.firstName)
    await this.page.getByLabel('Last name', { exact: false }).fill(data.lastName)
    await this.page.getByLabel('Email', { exact: false }).fill(data.email)
    if (data.password) {
      await this.page.getByLabel('Password', { exact: false }).fill(data.password)
    }
    await this.page.getByRole('button', { name: /create|save|submit/i }).click()
  }

  async edit(id: string | number, data: Partial<CreateUserData>) {
    await this.navigate(`/users/${id}`)
    await this.page.waitForLoadState('networkidle')

    if (data.firstName) {
      const field = this.page.getByLabel('First name', { exact: false })
      await field.clear()
      await field.fill(data.firstName)
    }
    if (data.lastName) {
      const field = this.page.getByLabel('Last name', { exact: false })
      await field.clear()
      await field.fill(data.lastName)
    }
    await this.page.getByRole('button', { name: /save|update/i }).click()
  }

  async search(query: string) {
    await this.navigate('/users')
    const searchInput = this.page.getByPlaceholder(/search/i).first()
    await searchInput.fill(query)
    await this.page.waitForTimeout(500)
  }

  async delete(id: string | number) {
    await this.navigate(`/users`)
    await this.page.locator(`[data-row-id="${id}"] [aria-label="Delete"], [data-user-id="${id}"] button`).first().click()
    await this.confirmDialog()
  }

  getTableRows() {
    return this.page.locator('table tbody tr')
  }
}
