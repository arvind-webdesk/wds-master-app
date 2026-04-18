import { pgTable, serial, integer, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { roles } from './roles'
import { permissions } from './permissions'

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id:           serial('id').primaryKey(),
    roleId:       integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: integer('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt:    timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    rolePermUnq:    unique('role_permissions_unq').on(table.roleId, table.permissionId),
    roleIdIdx:      index('role_permissions_role_id_idx').on(table.roleId),
    permissionIdIdx: index('role_permissions_permission_id_idx').on(table.permissionId),
  }),
)

export type RolePermission    = typeof rolePermissions.$inferSelect
export type NewRolePermission = typeof rolePermissions.$inferInsert
