import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull, like, or, desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { connections } from '@/lib/db/schema/connections'
import type { SafeConnection } from '@/lib/db/schema/connections'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { encryptJson } from '@/lib/crypto/encryption'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  q:      z.string().optional(),
  type:   z.enum(['shopify', 'bigcommerce']).optional(),
  status: z.enum(['active', 'disabled', 'error']).optional(),
  sort:   z.string().optional(),
  order:  z.enum(['asc', 'desc']).optional(),
})

const bcCredentialsSchema = z.object({
  storeHash:    z.string().trim().regex(/^[a-z0-9]+$/i).min(1).max(64),
  accessToken:  z.string().trim().min(10).max(500),
  clientId:     z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().min(1).max(500).optional(),
})

// Discriminated union: shopify must NOT include credentials; bigcommerce must.
const createSchema = z.discriminatedUnion('type', [
  z.object({
    type:            z.literal('shopify'),
    name:            z.string().trim().min(1).max(120),
    status:          z.enum(['active', 'disabled', 'error']).default('active'),
    storeIdentifier: z.string().trim().min(1).max(255)
      .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i, 'Must be a valid *.myshopify.com domain'),
    credentials:     z.never().optional(),
  }),
  z.object({
    type:            z.literal('bigcommerce'),
    name:            z.string().trim().min(1).max(120),
    status:          z.enum(['active', 'disabled', 'error']).default('active'),
    storeIdentifier: z.string().trim().min(1).max(64)
      .regex(/^[a-z0-9]+$/i, 'Must be a store hash (alphanumeric only, no leading stores/)'),
    credentials:     bcCredentialsSchema,
  }),
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSafe(row: typeof connections.$inferSelect): SafeConnection {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials, ...rest } = row
  return { ...rest, hasCredentials: credentials != null }
}

// ─── GET /api/connections ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Session
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. CASL
  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'Connection')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Validate query
  const parsed = listQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Invalid query', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { page, limit, q, type, status } = parsed.data
  const offset = (page - 1) * limit

  // 4. Build where
  const conditions: ReturnType<typeof eq>[] = [isNull(connections.deletedAt)]

  if (q) {
    conditions.push(
      or(
        like(connections.name, `%${q}%`),
        like(connections.storeIdentifier, `%${q}%`),
      )!,
    )
  }
  if (type) {
    conditions.push(eq(connections.type, type))
  }
  if (status) {
    conditions.push(eq(connections.status, status))
  }

  const whereClause = and(...conditions)

  // 5. Query + count
  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(connections)
      .where(whereClause)
      .orderBy(desc(connections.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(connections)
      .where(whereClause),
  ])

  const safe: SafeConnection[] = rows.map(toSafe)

  return NextResponse.json({
    data: safe,
    meta: { total: Number(count), page, limit },
  })
}

// ─── POST /api/connections ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Session
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. CASL
  const ability = defineAbilityFor(user)
  if (!ability.can('create', 'Connection')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // Explicit shopify rejection before full schema parse: if caller supplies
  // credentials alongside type=shopify, return the spec-mandated message.
  if (
    body !== null &&
    typeof body === 'object' &&
    (body as Record<string, unknown>).type === 'shopify' &&
    (body as Record<string, unknown>).credentials !== undefined
  ) {
    return NextResponse.json(
      {
        error: {
          message: 'Shopify connections must be created via OAuth. Use /api/connections/shopify/install',
          code: 'VALIDATION_ERROR',
        },
      },
      { status: 422 },
    )
  }

  // Also reject any direct POST for shopify without credentials
  // (the spec forbids manual Shopify creation entirely).
  if (
    body !== null &&
    typeof body === 'object' &&
    (body as Record<string, unknown>).type === 'shopify'
  ) {
    return NextResponse.json(
      {
        error: {
          message: 'Shopify connections must be created via OAuth. Use /api/connections/shopify/install',
          code: 'VALIDATION_ERROR',
        },
      },
      { status: 422 },
    )
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const data = parsed.data

  // BigCommerce only reaches here. Validate storeHash == storeIdentifier.
  if (data.type === 'bigcommerce' && data.credentials.storeHash !== data.storeIdentifier) {
    return NextResponse.json(
      { error: { message: 'credentials.storeHash must match storeIdentifier', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Encrypt credentials (may throw if CONNECTION_ENCRYPTION_KEY is missing)
  let encryptedCredentials: string
  try {
    encryptedCredentials = encryptJson(data.credentials)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/connections] encryption failed', msg)
    return NextResponse.json(
      { error: { message: msg, code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }

  // 5. Insert
  try {
    const [row] = await db
      .insert(connections)
      .values({
        name:            data.name,
        type:            data.type,
        status:          data.status,
        storeIdentifier: data.type === 'bigcommerce'
          ? data.storeIdentifier.toLowerCase()
          : data.storeIdentifier.toLowerCase(),
        credentials:     encryptedCredentials,
        createdBy:       user.id,
      })
      .returning()

    return NextResponse.json({ data: toSafe(row) }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      (err as { code?: string })?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      /UNIQUE constraint failed/i.test(msg)
    ) {
      return NextResponse.json(
        { error: { message: 'A connection for this store already exists.', code: 'CONFLICT' } },
        { status: 409 },
      )
    }
    console.error('[api/connections] create failed', msg)
    return NextResponse.json(
      { error: { message: 'Failed to create connection', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
