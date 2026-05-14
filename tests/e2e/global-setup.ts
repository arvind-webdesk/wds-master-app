import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

// Point at test.db before anything imports lib/db/client
process.env.DATABASE_URL = 'file:./test.db'

import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

import { roles } from '../../lib/db/schema/roles'
import { users } from '../../lib/db/schema/users'
import { permissions } from '../../lib/db/schema/permissions'
import { emailTemplates } from '../../lib/db/schema/email-templates'
import { settings } from '../../lib/db/schema/settings'
import { connections } from '../../lib/db/schema/connections'
import * as schema from '../../lib/db/index'

const MIGRATIONS_DIR = path.resolve('./drizzle/migrations')

// Test credentials — exported so specs can import them
export const SUPERADMIN_EMAIL    = 'admin@test.local'
export const SUPERADMIN_PASSWORD = 'Admin@1234'
export const VIEWER_EMAIL        = 'viewer@test.local'
export const VIEWER_PASSWORD     = 'Viewer@1234'

async function globalSetup() {
  console.log('\n[E2E] Setting up test database…\n')

  const client = createClient({ url: 'file:./test.db' })
  const db = drizzle(client, { schema })

  // 1. Run migrations (idempotent)
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  console.log('[E2E] Migrations applied')

  // 2. Roles
  let adminRoleId: number
  let viewerRoleId: number

  const [existingAdmin] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'superadmin')).limit(1)
  if (existingAdmin) {
    adminRoleId = existingAdmin.id
  } else {
    const [r] = await db.insert(roles).values({ name: 'superadmin', description: 'Full access' }).returning({ id: roles.id })
    adminRoleId = r!.id
  }

  const [existingViewer] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'viewer')).limit(1)
  if (existingViewer) {
    viewerRoleId = existingViewer.id
  } else {
    const [r] = await db.insert(roles).values({ name: 'viewer', description: 'Read-only access' }).returning({ id: roles.id })
    viewerRoleId = r!.id
  }
  console.log('[E2E] Roles ready')

  // 3. Users
  const adminHash  = await bcrypt.hash(SUPERADMIN_PASSWORD, 10)
  const viewerHash = await bcrypt.hash(VIEWER_PASSWORD, 10)

  const [existingAdminUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, SUPERADMIN_EMAIL)).limit(1)
  if (!existingAdminUser) {
    await db.insert(users).values({
      firstName: 'Super',
      lastName:  'Admin',
      email:     SUPERADMIN_EMAIL,
      password:  adminHash,
      userType:  'superadmin',
      status:    'active',
      roleId:    adminRoleId,
    })
  }

  const [existingViewerUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, VIEWER_EMAIL)).limit(1)
  if (!existingViewerUser) {
    await db.insert(users).values({
      firstName: 'View',
      lastName:  'Only',
      email:     VIEWER_EMAIL,
      password:  viewerHash,
      userType:  'user',
      status:    'active',
      roleId:    viewerRoleId,
    })
  }
  console.log('[E2E] Users ready')

  // 4. Sample email template
  const [existingTemplate] = await db.select({ id: emailTemplates.id }).from(emailTemplates).where(eq(emailTemplates.code, 'test-welcome')).limit(1)
  if (!existingTemplate) {
    await db.insert(emailTemplates).values({
      title:   'Test Welcome',
      code:    'test-welcome',
      subject: 'Welcome to the platform',
      body:    '<p>Hello {{name}}, welcome!</p>',
      status:  'active',
    })
  }

  // 5. Sample setting
  const [existingSetting] = await db.select({ id: settings.id }).from(settings).where(eq(settings.key, 'site_name')).limit(1)
  if (!existingSetting) {
    await db.insert(settings).values({ key: 'site_name', value: 'WDS Test' })
  }
  console.log('[E2E] Fixture data ready')

  client.close()
  console.log('[E2E] Global setup complete\n')
}

export default globalSetup
