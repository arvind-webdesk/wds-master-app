import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull, like, or, asc, desc, count } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { emailTemplates } from '@/lib/db/schema/email-templates'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

// ─── Validation schemas ───────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  search:    z.string().optional(),
  status:    z.enum(['active', 'inactive']).optional(),
  emailType: z.string().optional(),
  sort:      z
    .enum(['title', '-title', 'code', '-code', 'status', '-status', 'createdAt', '-createdAt', 'updatedAt', '-updatedAt'])
    .default('-createdAt'),
})

const createSchema = z.object({
  title:     z.string().trim().min(1).max(200),
  code:      z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'code must be lower-kebab-case'),
  subject:   z.string().trim().min(1).max(300),
  body:      z.string().max(100_000).default(''),
  status:    z.enum(['active', 'inactive']).default('active'),
  allowTo:   z.string().max(1000).nullish().transform(v => (v === '' || v == null) ? null : v),
  emailType: z.string().max(50).nullish().transform(v => (v === '' || v == null) ? null : v),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SORT_COLUMN_MAP = {
  title:     emailTemplates.title,
  code:      emailTemplates.code,
  status:    emailTemplates.status,
  createdAt: emailTemplates.createdAt,
  updatedAt: emailTemplates.updatedAt,
} as const

function buildOrderBy(sort: string) {
  const descending = sort.startsWith('-')
  const key = (descending ? sort.slice(1) : sort) as keyof typeof SORT_COLUMN_MAP
  const col = SORT_COLUMN_MAP[key] ?? emailTemplates.createdAt
  return descending ? desc(col) : asc(col)
}

function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.toLowerCase().includes('unique')
}

// ─── GET /api/email-templates ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
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

  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  )
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { page, limit, search, status, emailType, sort } = parsed.data
  const offset = (page - 1) * limit

  // Build where conditions
  const conditions = [isNull(emailTemplates.deletedAt)]

  if (search) {
    conditions.push(
      or(
        like(emailTemplates.title,   `%${search}%`),
        like(emailTemplates.code,    `%${search}%`),
        like(emailTemplates.subject, `%${search}%`),
      )!,
    )
  }

  if (status) {
    conditions.push(eq(emailTemplates.status, status))
  }

  if (emailType) {
    conditions.push(eq(emailTemplates.emailType, emailType))
  }

  const where = and(...conditions)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(emailTemplates)
      .where(where)
      .orderBy(buildOrderBy(sort))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(emailTemplates)
      .where(where),
  ])

  return NextResponse.json({
    data: rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}

// ─── POST /api/email-templates ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  const ability = defineAbilityFor(user)
  if (!ability.can('create', 'EmailTemplate')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
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

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  try {
    const [template] = await db
      .insert(emailTemplates)
      .values(parsed.data)
      .returning()

    return NextResponse.json({ data: template }, { status: 201 })
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: { message: 'A template with this code already exists', code: 'CONFLICT' } },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
