import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { roles } from './roles'

export const users = sqliteTable(
  'users',
  {
    id:                 integer('id').primaryKey({ autoIncrement: true }),
    firstName:          text('first_name').notNull(),
    lastName:           text('last_name').notNull(),
    email:              text('email').notNull().unique(),
    contactNo:          text('contact_no'),
    image:              text('image'),
    status:             text('status').notNull().default('active'),   // 'active' | 'inactive'
    userType:           text('user_type').notNull().default('admin'), // 'superadmin' | 'admin' | 'user'
    roleId:             integer('role_id').references(() => roles.id, { onDelete: 'set null' }),
    password:           text('password').notNull(), // bcrypt hash ONLY — never plain text
    portal:             text('portal'),
    resetPasswordToken: text('reset_password_token'),
    createdAt:          text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt:          text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt:          text('deleted_at'),
  },
  (table) => ({
    emailIdx:     index('users_email_idx').on(table.email),
    roleIdIdx:    index('users_role_id_idx').on(table.roleId),
    deletedAtIdx: index('users_deleted_at_idx').on(table.deletedAt),
  }),
)

export type User    = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

/** Safe user type — excludes password fields. Use this for API responses. */
export type SafeUser = Omit<User, 'password' | 'resetPasswordToken'>
