import { getIronSession, IronSession } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionUser {
  id: number
  email: string
  firstName: string
  lastName: string
  roleId: number | null
  userType: string
  permissions: Array<{ name: string; action: string }>
}

export interface SessionData {
  user?: SessionUser
}

const sessionOptions = {
  cookieName: process.env.IRON_SESSION_COOKIE_NAME ?? 'wds_session',
  password:   process.env.IRON_SESSION_SECRET!,
  cookieOptions: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge:   60 * 60 * 24 * 7, // 7 days
  },
}

/** Server-side: get the current session from the request cookies. */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, sessionOptions)
}

/** Returns session.user or null. Convenience wrapper. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession()
  return session.user ?? null
}

/** Saves updated user data back into the session cookie. */
export async function updateSession(user: SessionUser): Promise<void> {
  const session = await getSession()
  session.user = user
  await session.save()
}

/** Destroys the session (logout). */
export async function destroySession(): Promise<void> {
  const session = await getSession()
  session.destroy()
}
