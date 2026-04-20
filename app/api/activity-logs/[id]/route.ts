import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activityLogs } from '@/lib/db/schema/activity-logs'
import { users } from '@/lib/db/schema/users'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
  if (!ability.can('read', 'ActivityLog')) {
    return NextResponse.json(
      { error: { message: 'You do not have permission to view activity logs', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Coerce and validate path param
  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { message: 'Invalid activity log id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Fetch row with user left join
  const [row] = await db
    .select({
      id:          activityLogs.id,
      userId:      activityLogs.userId,
      action:      activityLogs.action,
      subjectType: activityLogs.subjectType,
      subjectId:   activityLogs.subjectId,
      meta:        activityLogs.meta,
      ip:          activityLogs.ip,
      userAgent:   activityLogs.userAgent,
      createdAt:   activityLogs.createdAt,
      updatedAt:   activityLogs.updatedAt,
      user: {
        id:        users.id,
        firstName: users.firstName,
        lastName:  users.lastName,
        email:     users.email,
      },
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.userId))
    .where(eq(activityLogs.id, id))
    .limit(1)

  if (!row) {
    return NextResponse.json(
      { error: { message: 'Activity log not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  const data = {
    ...row,
    user:
      row.user && row.user.id != null
        ? {
            id: row.user.id,
            firstName: row.user.firstName,
            lastName: row.user.lastName,
            email: row.user.email,
          }
        : null,
  }

  return NextResponse.json({ data })
}
