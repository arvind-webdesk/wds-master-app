import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema/users'
import { rolePermissions } from '@/lib/db/schema/role-permissions'
import { permissions } from '@/lib/db/schema/permissions'
import { verifyPassword } from '@/lib/auth/password'
import { getSession } from '@/lib/auth/session'

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  // 1. Parse + validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.errors[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { email, password } = parsed.data

  // 2. Look up user (never soft-deleted)
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1)

  if (!user) {
    return NextResponse.json(
      { error: { message: 'Invalid email or password', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 3. Verify password
  const valid = await verifyPassword(password, user.password)
  if (!valid) {
    return NextResponse.json(
      { error: { message: 'Invalid email or password', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 4. Check account status
  if (user.status === 'inactive') {
    return NextResponse.json(
      { error: { message: 'Your account has been deactivated. Contact support.', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 5. Load permissions for this user's role
  let userPermissions: Array<{ module: string; action: string }> = []
  if (user.roleId) {
    const rows = await db
      .select({ module: permissions.module, action: permissions.action })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, user.roleId))

    userPermissions = rows
  }

  // 6. Write iron-session
  const session = await getSession()
  session.user = {
    id:          user.id,
    email:       user.email,
    firstName:   user.firstName,
    lastName:    user.lastName,
    image:       user.image ?? undefined,
    roleId:      user.roleId ?? undefined,
    userType:    user.userType,
    permissions: userPermissions,
  }
  await session.save()

  return NextResponse.json({
    data: {
      id:        user.id,
      email:     user.email,
      firstName: user.firstName,
      lastName:  user.lastName,
      userType:  user.userType,
    },
  })
}
