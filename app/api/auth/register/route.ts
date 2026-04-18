import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema/users'
import { hashPassword } from '@/lib/auth/password'
import { getSession } from '@/lib/auth/session'

const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName:  z.string().min(1, 'Last name is required'),
  email:     z.string().email('Invalid email address'),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
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

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: parsed.error.errors[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const { firstName, lastName, email, password } = parsed.data
  const normalizedEmail = email.toLowerCase()

  // Check for existing account
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
    .limit(1)

  if (existing) {
    return NextResponse.json(
      { error: { message: 'An account with this email already exists', code: 'CONFLICT' } },
      { status: 409 },
    )
  }

  const hashedPassword = await hashPassword(password)

  const [newUser] = await db
    .insert(users)
    .values({
      firstName,
      lastName,
      email: normalizedEmail,
      password: hashedPassword,
      userType: 'user',
      status: 'active',
    })
    .returning({
      id:        users.id,
      email:     users.email,
      firstName: users.firstName,
      lastName:  users.lastName,
      userType:  users.userType,
    })

  if (!newUser) {
    return NextResponse.json(
      { error: { message: 'Failed to create account', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }

  // Auto sign-in after registration
  const session = await getSession()
  session.user = {
    id:          newUser.id,
    email:       newUser.email,
    firstName:   newUser.firstName,
    lastName:    newUser.lastName,
    userType:    newUser.userType,
    permissions: [],
  }
  await session.save()

  return NextResponse.json({ data: newUser }, { status: 201 })
}
