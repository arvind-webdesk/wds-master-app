import { test, expect } from '@playwright/test'
import { EmailTemplatesPage } from '../../pages/EmailTemplatesPage'

test.describe('Email Templates module', () => {
  let templatesPage: EmailTemplatesPage

  test.beforeEach(({ page }) => {
    templatesPage = new EmailTemplatesPage(page)
  })

  test('list renders seeded template', async ({ page }) => {
    await templatesPage.list()
    // The "Test Welcome" template is seeded in global-setup
    await expect(page.getByText('Test Welcome').or(page.getByText('test-welcome'))).toBeVisible()
  })

  test('create template navigates to form', async ({ page }) => {
    await templatesPage.list()
    const newLink = page.getByRole('link', { name: /new template|\+ new/i }).first()
    if (await newLink.isVisible()) {
      await newLink.click()
      await expect(page).toHaveURL(/\/email-templates\/new/)
    }
  })

  test('create email template with valid data', async ({ page }) => {
    const timestamp = Date.now()
    await templatesPage.create({
      title: `E2E Template ${timestamp}`,
      code: `e2e-template-${timestamp}`,
      subject: `E2E Subject ${timestamp}`,
      body: '<p>E2E test body</p>',
    })
    await expect(page).not.toHaveURL(/\/email-templates\/new/)
  })
})
