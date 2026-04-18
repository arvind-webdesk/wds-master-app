import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema/users'

const schema = z.object({
  email: z.string().email(),
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
      { error: { message: 'Please enter a valid email address', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const email = parsed.data.email.toLowerCase()

  // Always return success to prevent email enumeration
  const [user] = await db
    .select({ id: users.id, firstName: users.firstName })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1)

  if (user) {
    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 1000 * 60 * 60) // 1 hour

    await db
      .update(users)
      .set({ resetPasswordToken: `${token}:${expires.toISOString()}` })
      .where(eq(users.id, user.id))

    // TODO: send email via SES / Resend / SMTP with token
    // The reset URL would be: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`
    console.info(`[forgot-password] Reset token generated for user ${user.id}`)
  }

  return NextResponse.json({ data: { success: true } })
}
