import { test as setup } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_DIR  = path.join(__dirname, '.auth')
const AUTH_FILE = path.join(AUTH_DIR, 'superadmin.json')

setup('authenticate as superadmin', async ({ page }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true })

  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@test.local')
  await page.getByLabel('Password').fill('Admin@1234')
  await page.getByRole('button', { name: /sign in/i }).click()

  // Wait until we're on the dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 })

  await page.context().storageState({ path: AUTH_FILE })
})
