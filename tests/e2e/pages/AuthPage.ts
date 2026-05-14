import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class AuthPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async login(email: string, password: string) {
    await this.page.goto('/login')
    await this.page.getByLabel('Email').fill(email)
    await this.page.getByLabel('Password').fill(password)
    await this.page.getByRole('button', { name: /sign in/i }).click()
  }

  async logout() {
    // Open user menu and click logout
    await this.page.getByRole('button', { name: /account|user|avatar|menu/i }).last().click()
    await this.page.getByRole('menuitem', { name: /log out|sign out/i }).click()
    await this.page.waitForURL('**/login', { timeout: 10_000 })
  }

  async forgotPassword(email: string) {
    await this.page.goto('/forgot-password')
    await this.page.getByLabel('Email').fill(email)
    await this.page.getByRole('button', { name: /send|reset/i }).click()
  }

  async resetPassword(token: string, password: string, confirm: string) {
    await this.page.goto(`/reset-password?token=${token}`)
    const fields = this.page.getByRole('textbox')
    // Assumes two password fields in order
    await fields.nth(0).fill(password)
    await fields.nth(1).fill(confirm)
    await this.page.getByRole('button', { name: /reset|set password/i }).click()
  }

  getEmailError() {
    return this.page.locator('[data-field-error="email"], [role="alert"]').first()
  }

  getPasswordError() {
    return this.page.locator('[data-field-error="password"]').first()
  }

  getRootError() {
    return this.page.locator('.text-destructive, [role="alert"]').first()
  }
}
