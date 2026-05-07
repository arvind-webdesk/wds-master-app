CREATE TABLE `client_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`industry` text,
	`country` text,
	`timezone` text DEFAULT 'Etc/UTC' NOT NULL,
	`brand_primary_color` text DEFAULT '#1e40af' NOT NULL,
	`brand_secondary_color` text,
	`brand_font_family` text,
	`brand_logo_url` text,
	`brand_favicon_url` text,
	`sidebar_theme` text DEFAULT 'light' NOT NULL,
	`dashboard_type` text DEFAULT 'custom' NOT NULL,
	`plan_tier` text DEFAULT 'starter' NOT NULL,
	`user_seats` integer DEFAULT 5 NOT NULL,
	`go_live_date` text,
	`notes` text,
	`completed_at` text,
	`completed_by` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integration_config` (
	`platform` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`store_url` text,
	`store_hash` text,
	`sync_products` integer DEFAULT true NOT NULL,
	`sync_orders` integer DEFAULT true NOT NULL,
	`sync_customers` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `module_enablement` (
	`module_key` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
