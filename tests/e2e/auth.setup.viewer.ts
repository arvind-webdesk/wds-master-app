import { test as setup } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_DIR  = path.join(__dirname, '.auth')
const AUTH_FILE = path.join(AUTH_DIR, 'viewer.json')

setup('authenticate as viewer', async ({ page }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true })

  await page.goto('/login')
  await page.getByLabel('Email').fill('viewer@test.local')
  await page.getByLabel('Password').fill('Viewer@1234')
  await page.getByRole('button', { name: /sign in/i }).click()

  // Viewer may land on dashboard or any allowed route
  await page.waitForURL(/\/(dashboard|users|roles|connections)/, { timeout: 15_000 })

  await page.context().storageState({ path: AUTH_FILE })
})
