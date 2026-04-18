import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema/users'
import { hashPassword } from '@/lib/auth/password'

const schema = z.object({
  token:    z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.errors[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { token, password } = parsed.data

  // Find user with matching token
  const allUsers = await db
    .select({ id: users.id, resetPasswordToken: users.resetPasswordToken })
    .from(users)
    .where(and(isNull(users.deletedAt)))

  const matchedUser = allUsers.find((u) => {
    if (!u.resetPasswordToken) return false
    const [storedToken, expiresStr] = u.resetPasswordToken.split(':')
    if (storedToken !== token) return false
    const expires = new Date(expiresStr ?? '')
    return expires > new Date()
  })

  if (!matchedUser) {
    return NextResponse.json(
      { error: { message: 'This reset link is invalid or has expired', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  const hashedPassword = await hashPassword(password)

  await db
    .update(users)
    .set({ password: hashedPassword, resetPasswordToken: null })
    .where(eq(users.id, matchedUser.id))

  return NextResponse.json({ data: { success: true } })
}
