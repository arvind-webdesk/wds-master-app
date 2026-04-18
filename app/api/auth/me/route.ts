import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }
  return NextResponse.json({ data: user })
}
