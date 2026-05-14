import { NextRequest, NextResponse } from 'next/server'
import { destroySession, getSessionUser } from '@/lib/auth/session'
import { logActivity, getRequestContext } from '@/lib/logging/activity'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  await destroySession()

  if (user) {
    const ctx = getRequestContext(req)
    await logActivity({
      userId:      user.id,
      action:      'auth.logout',
      subjectType: 'Auth',
      subjectId:   user.id,
      ip:          ctx.ip,
      userAgent:   ctx.userAgent,
    })
  }

  return NextResponse.json({ data: { success: true } })
}
