import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * Single-row table holding the dashboard-wide client/branding configuration.
 * Written by the in-app setup wizard at /settings/dashboard-setup.
 *
 * The row is keyed by id=1; we always upsert into that row. `completedAt`
 * is null until the wizard's first successful save — that drives the
 * "finish setup" banner in the dashboard layout.
 */
export const clientConfig = sqliteTable('client_config', {
  id:                  integer('id').primaryKey({ autoIncrement: false }),

  // Client / business metadata
  name:                text('name').notNull().default(''),
  slug:                text('slug').notNull().default(''),
  industry:            text('industry'),
  country:             text('country'),
  timezone:            text('timezone').notNull().default('Etc/UTC'),

  // Branding
  brandPrimaryColor:   text('brand_primary_color').notNull().default('#1e40af'),
  brandSecondaryColor: text('brand_secondary_color'),
  brandFontFamily:     text('brand_font_family'),
  brandLogoUrl:        text('brand_logo_url'),
  brandFaviconUrl:     text('brand_favicon_url'),
  sidebarTheme:        text('sidebar_theme').notNull().default('light'),  // 'light' | 'navy' | 'zoho' | 'slate' | 'neutral'

  // Dashboard shape
  dashboardType:       text('dashboard_type').notNull().default('standalone'), // 'standalone' | 'custom' | 'middleware' | 'saas'

  // Free-form
  notes:               text('notes'),

  // Wizard lifecycle
  completedAt:         text('completed_at'),                      // null until wizard saved at least once
  completedBy:         integer('completed_by'),                   // users.id (no FK; nullable)

  createdAt:           text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt:           text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
})

export type ClientConfigRow    = typeof clientConfig.$inferSelect
export type NewClientConfigRow = typeof clientConfig.$inferInsert
