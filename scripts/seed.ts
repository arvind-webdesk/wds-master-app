/**
 * Seed script — creates the superadmin role and one superadmin user.
 *
 * Usage:
 *   pnpm db:seed
 *
 * Safe to re-run: skips creation if the email already exists.
 * Override defaults with env vars:
 *   SEED_EMAIL=admin@example.com SEED_PASSWORD=changeme pnpm db:seed
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '../lib/db/client'
import { roles } from '../lib/db/schema/roles'
import { users } from '../lib/db/schema/users'
import { permissions } from '../lib/db/schema/permissions'

// ─── Config ─────────────────────────────────────────────────────────────────

const SEED_EMAIL    = process.env.SEED_EMAIL    ?? 'admin@wds.local'
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Admin@1234'
const SEED_FNAME    = process.env.SEED_FNAME    ?? 'Super'
const SEED_LNAME    = process.env.SEED_LNAME    ?? 'Admin'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(msg: string)   { console.log(`  ✓  ${msg}`) }
function skip(msg: string) { console.log(`  –  ${msg} (already exists, skipped)`) }

// ─── Seed ────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\nSeeding database…\n')

  // 1. Superadmin role
  let roleId: number

  const [existingRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, 'superadmin'))
    .limit(1)

  if (existingRole) {
    skip('superadmin role')
    roleId = existingRole.id
  } else {
    const [newRole] = await db
      .insert(roles)
      .values({ name: 'superadmin', description: 'Full access to everything' })
      .returning({ id: roles.id })
    roleId = newRole!.id
    ok('Created role: superadmin')
  }

  // 2. Superadmin user
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_EMAIL.toLowerCase()))
    .limit(1)

  if (existingUser) {
    skip(`user: ${SEED_EMAIL}`)
  } else {
    const hashed = await bcrypt.hash(SEED_PASSWORD, 12)

    await db.insert(users).values({
      firstName: SEED_FNAME,
      lastName:  SEED_LNAME,
      email:     SEED_EMAIL.toLowerCase(),
      password:  hashed,
      userType:  'superadmin',
      status:    'active',
      roleId,
    })

    ok(`Created user: ${SEED_EMAIL}`)
  }

  // 3. Baseline permissions rows (one per module+action — drives the roles matrix UI)
  const USERS_PERMISSIONS = [
    { module: 'users', action: 'view' },
    { module: 'users', action: 'add' },
    { module: 'users', action: 'edit' },
    { module: 'users', action: 'delete' },
    { module: 'users', action: 'activate' },
  ]
  for (const p of USERS_PERMISSIONS) {
    const exists = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.module, p.module), eq(permissions.action, p.action)))
      .limit(1)
    if (exists.length === 0) {
      await db.insert(permissions).values({ name: p.module, module: p.module, action: p.action })
      ok(`Permission: ${p.module}:${p.action}`)
    } else {
      skip(`Permission: ${p.module}:${p.action}`)
    }
  }

  const ROLES_PERMISSIONS = [
    { module: 'roles', action: 'view' },
    { module: 'roles', action: 'add' },
    { module: 'roles', action: 'edit' },
    { module: 'roles', action: 'delete' },
  ]
  for (const p of ROLES_PERMISSIONS) {
    const exists = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.module, p.module), eq(permissions.action, p.action)))
      .limit(1)
    if (exists.length === 0) {
      await db.insert(permissions).values({ name: p.module, module: p.module, action: p.action })
      ok(`Permission: ${p.module}:${p.action}`)
    } else {
      skip(`Permission: ${p.module}:${p.action}`)
    }
  }

  const SETTINGS_PERMISSIONS = [
    { module: 'settings', action: 'view' },
    { module: 'settings', action: 'edit' },
  ]
  for (const p of SETTINGS_PERMISSIONS) {
    const exists = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.module, p.module), eq(permissions.action, p.action)))
      .limit(1)
    if (exists.length === 0) {
      await db.insert(permissions).values({ name: p.module, module: p.module, action: p.action })
      ok(`Permission: ${p.module}:${p.action}`)
    } else {
      skip(`Permission: ${p.module}:${p.action}`)
    }
  }

  const ACTIVITY_LOGS_PERMISSIONS = [
    { module: 'activity-logs', action: 'view' },
  ]
  for (const p of ACTIVITY_LOGS_PERMISSIONS) {
    const exists = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.module, p.module), eq(permissions.action, p.action)))
      .limit(1)
    if (exists.length === 0) {
      await db.insert(permissions).values({ name: p.module, module: p.module, action: p.action })
      ok(`Permission: ${p.module}:${p.action}`)
    } else {
      skip(`Permission: ${p.module}:${p.action}`)
    }
  }

  const API_LOGS_PERMISSIONS = [
    { module: 'api-logs', action: 'view' },
  ]
  for (const p of API_LOGS_PERMISSIONS) {
    const exists = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.module, p.module), eq(permissions.action, p.action)))
      .limit(1)
    if (exists.length === 0) {
      await db.insert(permissions).values({ name: p.module, module: p.module, action: p.action })
      ok(`Permission: ${p.module}:${p.action}`)
    } else {
      skip(`Permission: ${p.module}:${p.action}`)
    }
  }

  const EMAIL_TEMPLATES_PERMISSIONS = [
    { module: 'email-templates', action: 'view' },
    { module: 'email-templates', action: 'add' },
    { module: 'email-templates', action: 'edit' },
    { module: 'email-templates', action: 'delete' },
    { module: 'email-templates', action: 'send' },
  ]
  for (const p of EMAIL_TEMPLATES_PERMISSIONS) {
    const exists = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.module, p.module), eq(permissions.action, p.action)))
      .limit(1)
    if (exists.length === 0) {
      await db.insert(permissions).values({ name: p.module, module: p.module, action: p.action })
      ok(`Permission: ${p.module}:${p.action}`)
    } else {
      skip(`Permission: ${p.module}:${p.action}`)
    }
  }

  const DASHBOARD_PERMISSIONS = [
    { module: 'dashboard', action: 'view' },
  ]
  for (const p of DASHBOARD_PERMISSIONS) {
    const exists = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.module, p.module), eq(permissions.action, p.action)))
      .limit(1)
    if (exists.length === 0) {
      await db.insert(permissions).values({ name: p.module, module: p.module, action: p.action })
      ok(`Permission: ${p.module}:${p.action}`)
    } else {
      skip(`Permission: ${p.module}:${p.action}`)
    }
  }

  console.log(`
┌──────────────────────────────────────┐
│  Superadmin credentials              │
│  Email   : ${SEED_EMAIL.padEnd(26)}│
│  Password: ${SEED_PASSWORD.padEnd(26)}│
│                                      │
│  Change the password after first     │
│  sign-in via Settings → Account.     │
└──────────────────────────────────────┘
`)
}

seed().catch((err) => {
  console.error('\nSeed failed:', err)
  process.exit(1)
})
