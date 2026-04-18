import { createMongoAbility, MongoAbility, AbilityBuilder } from '@casl/ability'
import type { SessionUser } from '@/lib/auth/session'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Actions =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'activate'
  | 'export'
  | 'send'
  | 'manage'

export type Subjects =
  | 'User'
  | 'Role'
  | 'Permission'
  | 'EmailTemplate'
  | 'ActivityLog'
  | 'ApiLog'
  | 'Setting'
  | 'Dashboard'
  | 'all'

export type AppAbility = MongoAbility<[Actions, Subjects]>

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build a CASL ability for the given user.
 *
 * Superadmins get `manage all`.
 * Everyone else gets permissions derived from their role's permission rows,
 * which are stored in session.user.permissions as [{ name, action }].
 *
 * name  → CASL subject (e.g. 'users' → 'User')
 * action → CASL action (e.g. 'view' → 'read', 'add' → 'create')
 */
export function defineAbilityFor(user: SessionUser): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  if (user.userType === 'superadmin') {
    can('manage', 'all')
    return build()
  }

  for (const perm of user.permissions) {
    const subject = moduleToSubject(perm.name)
    const action  = actionMap(perm.action)
    if (subject && action) {
      can(action, subject)
    }
  }

  return build()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map DB module name to CASL subject */
function moduleToSubject(name: string): Subjects | null {
  const map: Record<string, Subjects> = {
    users:           'User',
    roles:           'Role',
    permissions:     'Permission',
    'email-templates': 'EmailTemplate',
    'activity-logs': 'ActivityLog',
    'api-logs':      'ApiLog',
    settings:        'Setting',
    dashboard:       'Dashboard',
  }
  return map[name] ?? null
}

/** Map DB action to CASL action */
function actionMap(action: string): Actions | null {
  const map: Record<string, Actions> = {
    view:     'read',
    add:      'create',
    edit:     'update',
    delete:   'delete',
    activate: 'activate',
    send:     'send',
    read:     'read',
    create:   'create',
    update:   'update',
  }
  return map[action] ?? null
}
