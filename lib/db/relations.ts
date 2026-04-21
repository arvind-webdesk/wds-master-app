import { relations } from 'drizzle-orm'
import { users } from './schema/users'
import { roles } from './schema/roles'
import { permissions } from './schema/permissions'
import { rolePermissions } from './schema/role-permissions'
import { emailTemplates, emailPhrases } from './schema/email-templates'
import { activityLogs } from './schema/activity-logs'
import { connections } from './schema/connections'
import { syncSchedules, syncJobs } from './schema/cron-sync'

export const usersRelations = relations(users, ({ one, many }) => ({
  role:         one(roles, { fields: [users.roleId], references: [roles.id] }),
  activityLogs: many(activityLogs),
  connections:  many(connections),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
  users:           many(users),
  rolePermissions: many(rolePermissions),
}))

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}))

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role:       one(roles,       { fields: [rolePermissions.roleId],       references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}))

export const emailTemplatesRelations = relations(emailTemplates, ({ many }) => ({
  phrases: many(emailPhrases),
}))

export const emailPhrasesRelations = relations(emailPhrases, ({ one }) => ({
  template: one(emailTemplates, { fields: [emailPhrases.templateId], references: [emailTemplates.id] }),
}))

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}))

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  createdByUser: one(users, { fields: [connections.createdBy], references: [users.id] }),
  schedules:     many(syncSchedules),
  jobs:          many(syncJobs),
}))

export const syncSchedulesRelations = relations(syncSchedules, ({ one }) => ({
  connection: one(connections, { fields: [syncSchedules.connectionId], references: [connections.id] }),
}))

export const syncJobsRelations = relations(syncJobs, ({ one }) => ({
  connection: one(connections, { fields: [syncJobs.connectionId], references: [connections.id] }),
}))
