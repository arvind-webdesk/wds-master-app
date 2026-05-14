import type { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { activityLogs } from '@/lib/db/schema/activity-logs'

export type ActivitySubjectType =
  | 'User'
  | 'Role'
  | 'Permission'
  | 'EmailTemplate'
  | 'Setting'
  | 'Connection'
  | 'CronSync'
  | 'SyncJob'
  | 'ApiLog'
  | 'ScopeDocument'
  | 'Account'
  | 'Auth'
  | 'System'

export interface LogActivityInput {
  userId?:      number | null
  action:       string
  subjectType:  ActivitySubjectType
  subjectId?:   number | null
  meta?:        unknown
  ip?:          string | null
  userAgent?:   string | null
}

/**
 * Inserts an audit row. Never throws — a logging failure must not break
 * the parent request. JSON-stringifies `meta` for the caller.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      userId:      input.userId ?? null,
      action:      input.action,
      subjectType: input.subjectType,
      subjectId:   input.subjectId ?? null,
      meta:        input.meta === undefined ? null : JSON.stringify(input.meta),
      ip:          input.ip ?? null,
      userAgent:   input.userAgent ?? null,
    })
  } catch (err) {
    console.error('[activity-log] failed to write row', err)
  }
}

/** Pulls IP + user-agent from a NextRequest. Both may be null. */
export function getRequestContext(req: NextRequest): { ip: string | null; userAgent: string | null } {
  const headers = req.headers
  const fwd = headers.get('x-forwarded-for')
  const ip =
    (fwd ? fwd.split(',')[0]?.trim() : null) ??
    headers.get('x-real-ip') ??
    null
  const userAgent = headers.get('user-agent') ?? null
  return { ip, userAgent }
}
