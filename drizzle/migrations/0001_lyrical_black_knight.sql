CREATE TABLE `activity_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` integer,
	`meta` text,
	`ip` text,
	`user_agent` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_logs_user_id_idx` ON `activity_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `activity_logs_action_idx` ON `activity_logs` (`action`);--> statement-breakpoint
CREATE INDEX `activity_logs_subject_idx` ON `activity_logs` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `activity_logs_created_at_idx` ON `activity_logs` (`created_at`);