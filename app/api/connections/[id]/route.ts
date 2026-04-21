import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { connections } from '@/lib/db/schema/connections'
import { users } from '@/lib/db/schema/users'
import type { SafeConnection } from '@/lib/db/schema/connections'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { encryptJson } from '@/lib/crypto/encryption'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSafe(row: typeof connections.$inferSelect): SafeConnection {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials, ...rest } = row
  return { ...rest, hasCredentials: credentials != null }
}

function coerceId(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ─── PATCH schema ─────────────────────────────────────────────────────────────

const bcCredentialsSchema = z.object({
  storeHash:    z.string().trim().regex(/^[a-z0-9]+$/i).min(1).max(64),
  accessToken:  z.string().trim().min(10).max(500),
  clientId:     z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().min(1).max(500).optional(),
})

const patchSchema = z.object({
  name:        z.string().trim().min(1).max(120).optional(),
  status:      z.enum(['active', 'disabled', 'error']).optional(),
  credentials: bcCredentialsSchema.optional(),
})

// ─── GET /api/connections/[id] ────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  // 3. Coerce id
  const { id: rawId } = await params
  const id = coerceId(rawId)
  if (id === null) {
    return NextResponse.json(
      { error: { message: 'Invalid connection id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Fetch connection + createdByUser
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), isNull(connections.deletedAt)))
    .limit(1)

  if (!row) {
    return NextResponse.json(
      { error: { message: 'Connection not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // Fetch the creator's basic info (optional join)
  let createdByUser: { id: number; email: string; firstName: string; lastName: string } | null = null
  if (row.createdBy != null) {
    const [creator] = await db
      .select({
        id:        users.id,
        email:     users.email,
        firstName: users.firstName,
        lastName:  users.lastName,
      })
      .from(users)
      .where(eq(users.id, row.createdBy))
      .limit(1)
    createdByUser = creator ?? null
  }

  return NextResponse.json({
    data: { ...toSafe(row), createdByUser },
  })
}

// ─── PATCH /api/connections/[id] ─────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
  if (!ability.can('update', 'Connection')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Coerce id
  const { id: rawId } = await params
  const id = coerceId(rawId)
  if (id === null) {
    return NextResponse.json(
      { error: { message: 'Invalid connection id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Load existing row
  const [existing] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), isNull(connections.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json(
      { error: { message: 'Connection not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 5. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const data = parsed.data

  // Reject credential updates on shopify rows — only OAuth callback may rotate them.
  if (data.credentials !== undefined && existing.type === 'shopify') {
    return NextResponse.json(
      {
        error: {
          message: 'Shopify credentials can only be rotated via OAuth. Use /api/connections/shopify/install',
          code: 'VALIDATION_ERROR',
        },
      },
      { status: 422 },
    )
  }

  // 6. Build update payload
  const updates: Partial<typeof connections.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }
  if (data.name !== undefined)   updates.name   = data.name
  if (data.status !== undefined) updates.status = data.status
  if (data.credentials !== undefined) {
    try {
      updates.credentials = encryptJson(data.credentials)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[api/connections] encryption failed', msg)
      return NextResponse.json(
        { error: { message: msg, code: 'INTERNAL_ERROR' } },
        { status: 500 },
      )
    }
  }

  // 7. Update
  try {
    const [updated] = await db
      .update(connections)
      .set(updates)
      .where(and(eq(connections.id, id), isNull(connections.deletedAt)))
      .returning()

    if (!updated) {
      return NextResponse.json(
        { error: { message: 'Connection not found', code: 'NOT_FOUND' } },
        { status: 404 },
      )
    }

    return NextResponse.json({ data: toSafe(updated) })
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
    console.error('[api/connections/[id]] update failed', msg)
    return NextResponse.json(
      { error: { message: 'Failed to update connection', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/connections/[id] ────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
  if (!ability.can('delete', 'Connection')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Coerce id
  const { id: rawId } = await params
  const id = coerceId(rawId)
  if (id === null) {
    return NextResponse.json(
      { error: { message: 'Invalid connection id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Verify exists
  const [existing] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.id, id), isNull(connections.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json(
      { error: { message: 'Connection not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 5. Soft-delete + disable
  await db
    .update(connections)
    .set({
      deletedAt: new Date().toISOString(),
      status:    'disabled',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(connections.id, id))

  return NextResponse.json({ data: { id } })
}
