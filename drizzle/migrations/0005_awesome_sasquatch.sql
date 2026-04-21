CREATE TABLE `sync_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`connection_id` integer NOT NULL,
	`target` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`records_seen` integer DEFAULT 0 NOT NULL,
	`records_upserted` integer DEFAULT 0 NOT NULL,
	`error` text,
	`triggered_by` integer,
	`started_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_jobs_connection_id_idx` ON `sync_jobs` (`connection_id`);--> statement-breakpoint
CREATE INDEX `sync_jobs_status_idx` ON `sync_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `sync_jobs_started_at_idx` ON `sync_jobs` (`started_at`);--> statement-breakpoint
CREATE TABLE `sync_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`connection_id` integer NOT NULL,
	`target` text NOT NULL,
	`cron_expression` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_schedules_connection_id_idx` ON `sync_schedules` (`connection_id`);--> statement-breakpoint
CREATE INDEX `sync_schedules_enabled_idx` ON `sync_schedules` (`enabled`);--> statement-breakpoint
CREATE INDEX `sync_schedules_deleted_at_idx` ON `sync_schedules` (`deleted_at`);