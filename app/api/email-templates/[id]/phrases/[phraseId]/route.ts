import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { emailTemplates, emailPhrases } from '@/lib/db/schema/email-templates'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

// ─── Validation schemas ───────────────────────────────────────────────────────

const patchPhraseSchema = z.object({
  key:   z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'key must contain only letters, numbers, underscores, or hyphens').optional(),
  value: z.string().max(5000).optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coerceId(id: string): number | null {
  const n = Number(id)
  return Number.isFinite(n) && Number.isInteger(n) ? n : null
}

async function resolvePhrase(templateId: number, phraseId: number) {
  const [phrase] = await db
    .select()
    .from(emailPhrases)
    .where(and(eq(emailPhrases.id, phraseId), eq(emailPhrases.templateId, templateId)))
    .limit(1)
  return phrase ?? null
}

// ─── PATCH /api/email-templates/[id]/phrases/[phraseId] ──────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; phraseId: string }> },
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

  const { id: rawId, phraseId: rawPhraseId } = await params
  const id = coerceId(rawId)
  const phraseId = coerceId(rawPhraseId)

  if (id === null || phraseId === null) {
    return NextResponse.json(
      { error: { message: 'Invalid id parameter', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // Verify parent template is not soft-deleted
  const [template] = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deletedAt)))
    .limit(1)

  if (!template) {
    return NextResponse.json(
      { error: { message: 'Template not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  const phrase = await resolvePhrase(id, phraseId)
  if (!phrase) {
    return NextResponse.json(
      { error: { message: 'Phrase not found', code: 'NOT_FOUND' } },
      { status: 404 },
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

  const parsed = patchPhraseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // If key is being renamed, check uniqueness for (templateId, newKey)
  if (parsed.data.key && parsed.data.key !== phrase.key) {
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
  }

  const [updated] = await db
    .update(emailPhrases)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(emailPhrases.id, phraseId))
    .returning()

  return NextResponse.json({ data: updated })
}

// ─── DELETE /api/email-templates/[id]/phrases/[phraseId] ─────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; phraseId: string }> },
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

  const { id: rawId, phraseId: rawPhraseId } = await params
  const id = coerceId(rawId)
  const phraseId = coerceId(rawPhraseId)

  if (id === null || phraseId === null) {
    return NextResponse.json(
      { error: { message: 'Invalid id parameter', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // Verify parent template is not soft-deleted
  const [template] = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deletedAt)))
    .limit(1)

  if (!template) {
    return NextResponse.json(
      { error: { message: 'Template not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  const phrase = await resolvePhrase(id, phraseId)
  if (!phrase) {
    return NextResponse.json(
      { error: { message: 'Phrase not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  // Phrases have no deletedAt — hard delete is correct per spec
  await db
    .delete(emailPhrases)
    .where(eq(emailPhrases.id, phraseId))

  return NextResponse.json({ data: { id: phraseId } })
}
