import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { settings } from '@/lib/db/schema/settings'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

const KEY_REGEX = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/

const putBodySchema = z.object({
  value: z.string().max(10_000).nullable(),
})

// ─── GET /api/settings/[key] ──────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  // 1. Session check
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. CASL check
  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'Setting')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Resolve + validate path param
  const { key } = await params
  const decodedKey = decodeURIComponent(key)
  if (!KEY_REGEX.test(decodedKey) || decodedKey.length > 128) {
    return NextResponse.json(
      { error: { message: 'Invalid settings key format', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Lookup
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.key, decodedKey), isNull(settings.deletedAt)))
    .limit(1)

  if (!row) {
    return NextResponse.json(
      { error: { message: 'Setting not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  return NextResponse.json({ data: row })
}

// ─── PUT /api/settings/[key] ──────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  // 1. Session check
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. CASL check
  const ability = defineAbilityFor(user)
  if (!ability.can('update', 'Setting')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Validate path param
  const { key } = await params
  const decodedKey = decodeURIComponent(key)
  if (!KEY_REGEX.test(decodedKey) || decodedKey.length > 128) {
    return NextResponse.json(
      { error: { message: 'Invalid settings key format', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const parsed = putBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { value } = parsed.data

  try {
    // 5. Check for existing row (including soft-deleted)
    const [existing] = await db
      .select({ id: settings.id })
      .from(settings)
      .where(eq(settings.key, decodedKey))
      .limit(1)

    let row

    if (existing) {
      // Update: restore if soft-deleted, set new value, bump updatedAt
      const [updated] = await db
        .update(settings)
        .set({
          value,
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        })
        .where(eq(settings.key, decodedKey))
        .returning()
      row = updated
    } else {
      // Insert new row
      const [inserted] = await db
        .insert(settings)
        .values({ key: decodedKey, value })
        .returning()
      row = inserted
    }

    return NextResponse.json({ data: row })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return NextResponse.json(
        { error: { message: 'A setting with this key already exists', code: 'CONFLICT' } },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/settings/[key] ───────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  // 1. Session check
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. CASL check
  const ability = defineAbilityFor(user)
  if (!ability.can('delete', 'Setting')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Validate path param
  const { key } = await params
  const decodedKey = decodeURIComponent(key)
  if (!KEY_REGEX.test(decodedKey) || decodedKey.length > 128) {
    return NextResponse.json(
      { error: { message: 'Invalid settings key format', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Find the row (must exist and not already be soft-deleted)
  const [existing] = await db
    .select({ id: settings.id, key: settings.key })
    .from(settings)
    .where(and(eq(settings.key, decodedKey), isNull(settings.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json(
      { error: { message: 'Setting not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 5. Soft delete
  const now = new Date().toISOString()
  const [deleted] = await db
    .update(settings)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(settings.key, decodedKey))
    .returning({ id: settings.id, key: settings.key, deletedAt: settings.deletedAt })

  return NextResponse.json({ data: deleted })
}
