import { relations } from 'drizzle-orm'
import { users } from './schema/users'
import { roles } from './schema/roles'
import { permissions } from './schema/permissions'
import { rolePermissions } from './schema/role-permissions'
import { emailTemplates, emailPhrases } from './schema/email-templates'

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
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
