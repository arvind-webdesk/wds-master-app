import { sqliteTable, integer, text, index, unique } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { roles } from './roles'
import { permissions } from './permissions'

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    id:           integer('id').primaryKey({ autoIncrement: true }),
    roleId:       integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: integer('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt:    text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    rolePermUnq:     unique('role_permissions_unq').on(table.roleId, table.permissionId),
    roleIdIdx:       index('role_permissions_role_id_idx').on(table.roleId),
    permissionIdIdx: index('role_permissions_permission_id_idx').on(table.permissionId),
  }),
)

export type RolePermission    = typeof rolePermissions.$inferSelect
export type NewRolePermission = typeof rolePermissions.$inferInsert
