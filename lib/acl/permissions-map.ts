/** Canonical list of modules shown in the Roles permission matrix. */
export const PERMISSION_MODULES = [
  { key: 'users',            label: 'Users',            actions: ['view', 'add', 'edit', 'delete', 'activate'] },
  { key: 'roles',            label: 'Roles',            actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'email-templates',  label: 'Email Templates',  actions: ['view', 'add', 'edit', 'delete', 'send'] },
  { key: 'activity-logs',    label: 'Activity Logs',    actions: ['view'] },
  { key: 'api-logs',         label: 'API Logs',         actions: ['view'] },
  { key: 'settings',         label: 'Settings',         actions: ['view', 'edit'] },
  { key: 'dashboard',        label: 'Dashboard',        actions: ['view'] },
] as const

export type PermissionModuleKey = typeof PERMISSION_MODULES[number]['key']
export type PermissionAction    = 'view' | 'add' | 'edit' | 'delete' | 'activate' | 'send'
