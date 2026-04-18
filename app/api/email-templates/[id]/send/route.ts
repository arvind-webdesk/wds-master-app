import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { emailTemplates, emailPhrases } from '@/lib/db/schema/email-templates'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

// TODO: implement lib/email/send.ts — for now we no-op so routes compile even
// if the module does not yet exist. Replace this block with the real import
// once the mailer adapter is available:
//   import { sendEmail } from '@/lib/email/send'
let sendEmail: (opts: { to: string; subject: string; html: string }) => Promise<void>
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/lib/email/send') as { sendEmail: typeof sendEmail }
  sendEmail = mod.sendEmail
} catch {
  // Mailer not yet implemented — stub with a no-op
  sendEmail = async () => { /* TODO: wire up lib/email/send.ts */ }
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const sendSchema = z.object({
  to:        z.array(z.string().email()).min(1).max(10),
  overrides: z.record(z.string(), z.string()).optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coerceId(id: string): number | null {
  const n = Number(id)
  return Number.isFinite(n) && Number.isInteger(n) ? n : null
}

/** Replace {{key}} tokens in a string with values from the map. Missing keys become empty string. */
function renderTokens(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '')
}

/** Check whether an email address is permitted by an allowTo string.
 *  allowTo is a comma-separated list of exact emails or wildcard domains like *@example.com.
 */
function isRecipientAllowed(email: string, allowTo: string): boolean {
  const rules = allowTo.split(',').map(r => r.trim()).filter(Boolean)
  for (const rule of rules) {
    if (rule.startsWith('*@')) {
      const domain = rule.slice(2).toLowerCase()
      if (email.toLowerCase().endsWith(`@${domain}`)) return true
    } else {
      if (rule.toLowerCase() === email.toLowerCase()) return true
    }
  }
  return false
}

// ─── POST /api/email-templates/[id]/send ─────────────────────────────────────

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
  if (!ability.can('send', 'EmailTemplate')) {
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

  const parsed = sendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { to, overrides = {} } = parsed.data

  // 1. Load template — must exist, not soft-deleted, and be active
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

  if (template.status !== 'active') {
    return NextResponse.json(
      { error: { message: 'Template is inactive', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 2. Validate recipients against allowTo
  if (template.allowTo) {
    for (const recipient of to) {
      if (!isRecipientAllowed(recipient, template.allowTo)) {
        return NextResponse.json(
          { error: { message: 'Recipient not allowed by template allow_to', code: 'FORBIDDEN' } },
          { status: 403 },
        )
      }
    }
  }

  // 3. Load phrases and merge with overrides (overrides win)
  const phraseRows = await db
    .select()
    .from(emailPhrases)
    .where(eq(emailPhrases.templateId, id))

  const phraseValues: Record<string, string> = {}
  for (const p of phraseRows) {
    phraseValues[p.key] = p.value
  }
  // Merge — override values take precedence; unknown keys are passed through
  const merged = { ...phraseValues, ...overrides }

  // 4. Render subject and body by substituting {{key}} tokens
  const renderedSubject = renderTokens(template.subject, merged)
  const renderedBody    = renderTokens(template.body,    merged)

  // 5. Dispatch emails
  try {
    for (const recipient of to) {
      await sendEmail({ to: recipient, subject: renderedSubject, html: renderedBody })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mail provider error'
    return NextResponse.json(
      { error: { message, code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { data: { sent: to.length, recipients: to } },
    { status: 202 },
  )
}
