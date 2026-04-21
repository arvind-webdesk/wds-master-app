/** Canonical list of modules shown in the Roles permission matrix. */
export const PERMISSION_MODULES = [
  { key: 'users',            label: 'Users',            actions: ['view', 'add', 'edit', 'delete', 'activate'] },
  { key: 'roles',            label: 'Roles',            actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'email-templates',  label: 'Email Templates',  actions: ['view', 'add', 'edit', 'delete', 'send'] },
  { key: 'activity-logs',    label: 'Activity Logs',    actions: ['view'] },
  { key: 'api-logs',         label: 'API Logs',         actions: ['view'] },
  { key: 'settings',         label: 'Settings',         actions: ['view', 'edit'] },
  { key: 'dashboard',        label: 'Dashboard',        actions: ['view'] },
  { key: 'integrations',     label: 'Integrations',     actions: ['view', 'sync'] },
  { key: 'connections',      label: 'Connections',      actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'sync-history',    label: 'Sync History',    actions: ['view'] },
  { key: 'cron-sync',       label: 'Cron Sync',       actions: ['view', 'add', 'edit', 'delete'] },
] as const

export type PermissionModuleKey = typeof PERMISSION_MODULES[number]['key']
export type PermissionAction    = 'view' | 'add' | 'edit' | 'delete' | 'activate' | 'send' | 'sync'
