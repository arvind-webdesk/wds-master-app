CREATE TABLE `integration_customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`email` text,
	`first_name` text,
	`last_name` text,
	`orders_count` integer,
	`total_spent` text,
	`raw` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_customers_platform_external_uq` ON `integration_customers` (`platform`,`external_id`);--> statement-breakpoint
CREATE INDEX `integration_customers_platform_idx` ON `integration_customers` (`platform`);--> statement-breakpoint
CREATE TABLE `integration_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`order_number` text,
	`customer_email` text,
	`total_price` text,
	`currency` text,
	`status` text,
	`placed_at` text,
	`raw` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_orders_platform_external_uq` ON `integration_orders` (`platform`,`external_id`);--> statement-breakpoint
CREATE INDEX `integration_orders_platform_idx` ON `integration_orders` (`platform`);--> statement-breakpoint
CREATE INDEX `integration_orders_placed_at_idx` ON `integration_orders` (`placed_at`);--> statement-breakpoint
CREATE TABLE `integration_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text,
	`sku` text,
	`price` text,
	`currency` text,
	`status` text,
	`raw` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_products_platform_external_uq` ON `integration_products` (`platform`,`external_id`);--> statement-breakpoint
CREATE INDEX `integration_products_platform_idx` ON `integration_products` (`platform`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`target` text NOT NULL,
	`status` text NOT NULL,
	`records_seen` integer DEFAULT 0 NOT NULL,
	`records_upserted` integer DEFAULT 0 NOT NULL,
	`error` text,
	`triggered_by` integer,
	`started_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `sync_runs_platform_idx` ON `sync_runs` (`platform`);--> statement-breakpoint
CREATE INDEX `sync_runs_target_idx` ON `sync_runs` (`platform`,`target`);--> statement-breakpoint
CREATE INDEX `sync_runs_finished_at_idx` ON `sync_runs` (`finished_at`);