import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull, asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { emailTemplates, emailPhrases } from '@/lib/db/schema/email-templates'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

// ─── Validation schemas ───────────────────────────────────────────────────────

const patchSchema = z.object({
  title:     z.string().trim().min(1).max(200).optional(),
  // code is intentionally excluded — immutable after creation
  subject:   z.string().trim().min(1).max(300).optional(),
  body:      z.string().max(100_000).optional(),
  status:    z.enum(['active', 'inactive']).optional(),
  allowTo:   z.string().max(1000).nullish().transform(v => (v === '' || v == null) ? null : v),
  emailType: z.string().max(50).nullish().transform(v => (v === '' || v == null) ? null : v),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coerceId(id: string): number | null {
  const n = Number(id)
  return Number.isFinite(n) && Number.isInteger(n) ? n : null
}

// ─── GET /api/email-templates/[id] ───────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'EmailTemplate')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  const { id: rawId } = await params
  const id = coerceId(rawId)
  if (id === null) {
    return NextResponse.json(
      { error: { message: 'Invalid template id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deletedAt)))
    .limit(1)

  if (!template) {
    return NextResponse.json(
      { error: { message: 'Template not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  const phrases = await db
    .select()
    .from(emailPhrases)
    .where(eq(emailPhrases.templateId, id))
    .orderBy(asc(emailPhrases.key))

  return NextResponse.json({ data: { ...template, phrases } })
}

// ─── PATCH /api/email-templates/[id] ─────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  const ability = defineAbilityFor(user)
  if (!ability.can('update', 'EmailTemplate')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  const { id: rawId } = await params
  const id = coerceId(rawId)
  if (id === null) {
    return NextResponse.json(
      { error: { message: 'Invalid template id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // Strip code from incoming payload before validation to enforce immutability
  if (body !== null && typeof body === 'object') {
    delete (body as Record<string, unknown>).code
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // Verify the template exists and is not soft-deleted
  const [existing] = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json(
      { error: { message: 'Template not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  const [updated] = await db
    .update(emailTemplates)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(emailTemplates.id, id))
    .returning()

  return NextResponse.json({ data: updated })
}

// ─── DELETE /api/email-templates/[id] ────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  const ability = defineAbilityFor(user)
  if (!ability.can('delete', 'EmailTemplate')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  const { id: rawId } = await params
  const id = coerceId(rawId)
  if (id === null) {
    return NextResponse.json(
      { error: { message: 'Invalid template id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const [existing] = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json(
      { error: { message: 'Template not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  await db
    .update(emailTemplates)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(emailTemplates.id, id))

  return NextResponse.json({ data: { id } })
}
