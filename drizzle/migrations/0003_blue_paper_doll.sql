CREATE TABLE `integration_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`store_identifier` text NOT NULL,
	`credentials` text,
	`last_sync_at` text,
	`created_by` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `connections_type_idx` ON `integration_connections` (`type`);--> statement-breakpoint
CREATE INDEX `connections_status_idx` ON `integration_connections` (`status`);--> statement-breakpoint
CREATE INDEX `connections_store_identifier_idx` ON `integration_connections` (`store_identifier`);--> statement-breakpoint
CREATE INDEX `connections_deleted_at_idx` ON `integration_connections` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `connections_type_store_identifier_uq` ON `integration_connections` (`type`,`store_identifier`) WHERE deleted_at IS NULL;