import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import type { SessionData } from '@/lib/auth/session'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/webhook',
  '/_next',
  '/favicon.ico',
  '/public',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const start = Date.now()

  // Allow public routes through
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Check session
  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(req, res, {
    cookieName: process.env.IRON_SESSION_COOKIE_NAME ?? 'wds_session',
    password:   process.env.IRON_SESSION_SECRET!,
  })

  const isApiRoute = pathname.startsWith('/api/')

  if (!session.user) {
    if (isApiRoute) {
      return NextResponse.json(
        { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
        { status: 401 },
      )
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return res
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and Next.js internals.
     * Public paths are handled inside the middleware function.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
