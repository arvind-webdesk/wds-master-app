import { NextRequest, NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { apiLogs } from '@/lib/db/schema/api-logs'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { idParamSchema } from '../_validation'

type ParsedJsonField<T> = T | { __raw: string; parseError: true }

function safeParseJson<T>(raw: string | null): ParsedJsonField<T> | null {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return { __raw: raw, parseError: true }
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Auth — session
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. ACL — CASL
  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'ApiLog')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Coerce + validate path param
  const { id: idRaw } = await params
  const parsedId = idParamSchema.safeParse(idRaw)
  if (!parsedId.success) {
    return NextResponse.json(
      {
        error: {
          message: parsedId.error.issues[0]?.message ?? 'Invalid id',
          code: 'VALIDATION_ERROR',
        },
      },
      { status: 422 },
    )
  }

  const id = parsedId.data

  // 4. DB query — soft-delete guard
  try {
    const [row] = await db
      .select()
      .from(apiLogs)
      .where(and(eq(apiLogs.id, id), isNull(apiLogs.deletedAt)))
      .limit(1)

    if (!row) {
      return NextResponse.json(
        { error: { message: 'API log not found', code: 'NOT_FOUND' } },
        { status: 404 },
      )
    }

    // 5. Parse JSON fields — non-throwing fallback per spec §2.4
    const dataKeys = safeParseJson<string[]>(row.dataKeys)
    const responseHeaders = safeParseJson<Record<string, string>>(row.responseHeaders)

    // Omit deletedAt from the response (always null for visible rows)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { deletedAt: _deletedAt, dataKeys: _dk, responseHeaders: _rh, ...rest } = row

    return NextResponse.json({
      data: {
        ...rest,
        dataKeys,
        responseHeaders,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error'
    console.error('[api-logs:detail]', message)
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
