# API Response + Handler Snippets

These are the **canonical** patterns for every API route in this project.
Copy into new `app/api/**/*route.ts` files. Do not improvise.

## Error codes (exhaustive)

| Code                | HTTP | When                                                |
|---------------------|------|------------------------------------------------------|
| `UNAUTHORIZED`      | 401  | No session / invalid session                         |
| `FORBIDDEN`         | 403  | Session valid but CASL check failed                  |
| `NOT_FOUND`         | 404  | Resource doesn't exist (or was soft-deleted)         |
| `VALIDATION_ERROR`  | 422  | Zod parse failed                                     |
| `CONFLICT`          | 409  | Unique constraint violation / duplicate              |
| `INTERNAL_ERROR`    | 500  | Anything else                                        |

## Success response shapes

```ts
// Single resource:
return NextResponse.json({ data: row })

// Paginated list:
return NextResponse.json({ data: rows, meta: { total, page, limit } })

// Created (return 201):
return NextResponse.json({ data: row }, { status: 201 })

// Soft-deleted:
return NextResponse.json({ data: { id } })
```

## Error response helper

```ts
function errorResponse(message: string, code: ErrorCode, status: number) {
  return NextResponse.json({ error: { message, code } }, { status })
}
```

## Canonical GET list handler

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull, like, or, desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { <tableName> } from '@/lib/db/schema/<slug>'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

const querySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  // add module-specific filters here, e.g. status: z.enum([...]).optional()
})

export async function GET(req: NextRequest) {
  // 1. Session
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. Ability
  const ability = defineAbilityFor(user)
  if (!ability.can('read', '<Subject>')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Validate query
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.errors[0]?.message ?? 'Invalid query', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }
  const { page, limit, search } = parsed.data
  const offset = (page - 1) * limit

  // 4. Where
  const conditions = [isNull(<tableName>.deletedAt)]
  if (search) {
    conditions.push(or(
      like(<tableName>.<searchField1>, `%${search}%`),
      like(<tableName>.<searchField2>, `%${search}%`),
    )!)
  }
  const whereClause = and(...conditions)

  // 5. Query + count
  const [rows, [{ count }]] = await Promise.all([
    db.select().from(<tableName>).where(whereClause).orderBy(desc(<tableName>.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(<tableName>).where(whereClause),
  ])

  return NextResponse.json({
    data: rows,
    meta: { total: Number(count), page, limit },
  })
}
```

## Canonical POST create handler

```ts
const createSchema = z.object({
  // module-specific fields
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } }, { status: 401 })

  const ability = defineAbilityFor(user)
  if (!ability.can('create', '<Subject>')) {
    return NextResponse.json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: { message: 'Invalid JSON', code: 'VALIDATION_ERROR' } }, { status: 422 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.errors[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  try {
    const [row] = await db.insert(<tableName>).values(parsed.data).returning()
    return NextResponse.json({ data: row }, { status: 201 })
  } catch (err: any) {
    // SQLite unique-constraint error
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(String(err?.message))) {
      return NextResponse.json({ error: { message: 'Already exists', code: 'CONFLICT' } }, { status: 409 })
    }
    console.error('[api/<slug>] create failed', err?.message)
    return NextResponse.json({ error: { message: 'Failed to create', code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
```

## Canonical `[id]` handlers (GET / PATCH / DELETE soft)

```ts
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } }, { status: 401 })
  const ability = defineAbilityFor(user)
  if (!ability.can('read', '<Subject>')) {
    return NextResponse.json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } }, { status: 403 })
  }

  const { id } = await params
  const [row] = await db.select().from(<tableName>)
    .where(and(eq(<tableName>.id, Number(id)), isNull(<tableName>.deletedAt)))
    .limit(1)

  if (!row) return NextResponse.json({ error: { message: 'Not found', code: 'NOT_FOUND' } }, { status: 404 })
  return NextResponse.json({ data: row })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } }, { status: 401 })
  const ability = defineAbilityFor(user)
  if (!ability.can('delete', '<Subject>')) {
    return NextResponse.json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } }, { status: 403 })
  }

  const { id } = await params
  await db.update(<tableName>)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(<tableName>.id, Number(id)))

  return NextResponse.json({ data: { id: Number(id) } })
}
```

## Never

- Never `DELETE` rows — always set `deletedAt`.
- Never `console.log(body)` — may contain passwords or tokens.
- Never import `pg`, `drizzle-orm/pg-core`, `@prisma/client`.
- Never skip the `isNull(deletedAt)` filter on list or detail queries.
- Never trust `req.nextUrl.searchParams` without Zod-parsing through the schema.
