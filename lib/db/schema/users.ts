import { pgTable, serial, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { roles } from './roles'

export const users = pgTable(
  'users',
  {
    id:                 serial('id').primaryKey(),
    firstName:          varchar('first_name', { length: 100 }).notNull(),
    lastName:           varchar('last_name', { length: 100 }).notNull(),
    email:              varchar('email', { length: 255 }).notNull().unique(),
    contactNo:          varchar('contact_no', { length: 30 }),
    image:              text('image'),
    status:             varchar('status', { length: 20 }).notNull().default('active'),   // 'active' | 'inactive'
    userType:           varchar('user_type', { length: 50 }).notNull().default('admin'),
    roleId:             integer('role_id').references(() => roles.id, { onDelete: 'set null' }),
    password:           text('password').notNull(), // bcrypt hash ONLY — never plain text
    portal:             varchar('portal', { length: 50 }),
    resetPasswordToken: text('reset_password_token'),
    createdAt:          timestamp('created_at').defaultNow().notNull(),
    updatedAt:          timestamp('updated_at').defaultNow().notNull(),
    deletedAt:          timestamp('deleted_at'),
  },
  (table) => ({
    emailIdx:      index('users_email_idx').on(table.email),
    roleIdIdx:     index('users_role_id_idx').on(table.roleId),
    deletedAtIdx:  index('users_deleted_at_idx').on(table.deletedAt),
  }),
)

export type User    = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

/** Safe user type — excludes password fields. Use this for API responses. */
export type SafeUser = Omit<User, 'password' | 'resetPasswordToken'>
