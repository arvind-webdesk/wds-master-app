CREATE TABLE `api_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`log_type` text,
	`message` text,
	`ip` text,
	`user_agent` text,
	`method` text,
	`url` text,
	`response_status` integer,
	`response_body_preview` text,
	`duration_ms` integer,
	`is_error` integer DEFAULT false NOT NULL,
	`error_type` text,
	`error_stack` text,
	`source` text,
	`environment` text,
	`data_keys` text,
	`response_headers` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `api_logs_is_error_idx` ON `api_logs` (`is_error`);--> statement-breakpoint
CREATE INDEX `api_logs_created_at_idx` ON `api_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `api_logs_response_status_idx` ON `api_logs` (`response_status`);--> statement-breakpoint
CREATE TABLE `email_phrases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `email_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_phrases_template_id_idx` ON `email_phrases` (`template_id`);--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`code` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`allow_to` text,
	`email_type` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_templates_code_unique` ON `email_templates` (`code`);--> statement-breakpoint
CREATE INDEX `email_templates_code_idx` ON `email_templates` (`code`);--> statement-breakpoint
CREATE INDEX `email_templates_status_idx` ON `email_templates` (`status`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`action` text NOT NULL,
	`module` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `permissions_name_idx` ON `permissions` (`name`);--> statement-breakpoint
CREATE INDEX `permissions_module_idx` ON `permissions` (`module`);--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_name_action_unq` ON `permissions` (`name`,`action`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` integer NOT NULL,
	`permission_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_permissions_role_id_idx` ON `role_permissions` (`role_id`);--> statement-breakpoint
CREATE INDEX `role_permissions_permission_id_idx` ON `role_permissions` (`permission_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `role_permissions_unq` ON `role_permissions` (`role_id`,`permission_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE INDEX `roles_name_idx` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);--> statement-breakpoint
CREATE INDEX `settings_key_idx` ON `settings` (`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`contact_no` text,
	`image` text,
	`status` text DEFAULT 'active' NOT NULL,
	`user_type` text DEFAULT 'admin' NOT NULL,
	`role_id` integer,
	`password` text NOT NULL,
	`portal` text,
	`reset_password_token` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_id_idx` ON `users` (`role_id`);--> statement-breakpoint
CREATE INDEX `users_deleted_at_idx` ON `users` (`deleted_at`);