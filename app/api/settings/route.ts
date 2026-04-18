import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull, like, or, asc, desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { settings } from '@/lib/db/schema/settings'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

const querySchema = z.object({
  search: z.string().optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  sort:   z.enum(['key', 'updatedAt', 'createdAt']).default('key'),
  order:  z.enum(['asc', 'desc']).default('asc'),
})

export async function GET(req: NextRequest) {
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

  // 3. Parse + validate query params
  const { searchParams } = req.nextUrl
  const parsed = querySchema.safeParse({
    search: searchParams.get('search') ?? undefined,
    page:   searchParams.get('page')   ?? undefined,
    limit:  searchParams.get('limit')  ?? undefined,
    sort:   searchParams.get('sort')   ?? undefined,
    order:  searchParams.get('order')  ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { search, page, limit, sort, order } = parsed.data
  const offset = (page - 1) * limit

  // 4. Build where clause
  const baseFilter = isNull(settings.deletedAt)
  const whereClause = search
    ? and(
        baseFilter,
        or(
          like(settings.key,   `%${search}%`),
          like(settings.value, `%${search}%`),
        ),
      )
    : baseFilter

  // Map sort field to column
  const sortColumn =
    sort === 'updatedAt' ? settings.updatedAt :
    sort === 'createdAt' ? settings.createdAt :
    settings.key

  const orderFn = order === 'desc' ? desc : asc

  // 5. Count total
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(settings)
    .where(whereClause)

  // 6. Fetch page
  const rows = await db
    .select()
    .from(settings)
    .where(whereClause)
    .orderBy(orderFn(sortColumn))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({
    data: rows,
    meta: { page, limit, total: Number(total) },
  })
}
