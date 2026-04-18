import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull, asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { emailTemplates, emailPhrases } from '@/lib/db/schema/email-templates'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

// ─── Validation schemas ───────────────────────────────────────────────────────

const createPhraseSchema = z.object({
  key:   z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'key must contain only letters, numbers, underscores, or hyphens'),
  value: z.string().max(5000),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coerceId(id: string): number | null {
  const n = Number(id)
  return Number.isFinite(n) && Number.isInteger(n) ? n : null
}

async function resolveTemplate(id: number) {
  const [template] = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deletedAt)))
    .limit(1)
  return template ?? null
}

// ─── GET /api/email-templates/[id]/phrases ────────────────────────────────────

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

  const template = await resolveTemplate(id)
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

  return NextResponse.json({ data: phrases })
}

// ─── POST /api/email-templates/[id]/phrases ───────────────────────────────────

export async function POST(
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

  const parsed = createPhraseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const template = await resolveTemplate(id)
  if (!template) {
    return NextResponse.json(
      { error: { message: 'Template not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // Enforce (templateId, key) uniqueness at application level
  const [duplicate] = await db
    .select({ id: emailPhrases.id })
    .from(emailPhrases)
    .where(and(eq(emailPhrases.templateId, id), eq(emailPhrases.key, parsed.data.key)))
    .limit(1)

  if (duplicate) {
    return NextResponse.json(
      { error: { message: 'Phrase key already exists for this template', code: 'CONFLICT' } },
      { status: 409 },
    )
  }

  const [phrase] = await db
    .insert(emailPhrases)
    .values({ templateId: id, key: parsed.data.key, value: parsed.data.value })
    .returning()

  return NextResponse.json({ data: phrase }, { status: 201 })
}
