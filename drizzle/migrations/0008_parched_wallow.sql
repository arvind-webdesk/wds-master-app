CREATE TABLE `project_planning` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_date` text,
	`milestones` text DEFAULT '[]' NOT NULL,
	`deliverables` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scope_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`stored_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` integer,
	`uploaded_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `scope_documents_deleted_at_idx` ON `scope_documents` (`deleted_at`);--> statement-breakpoint
DROP INDEX "activity_logs_user_id_idx";--> statement-breakpoint
DROP INDEX "activity_logs_action_idx";--> statement-breakpoint
DROP INDEX "activity_logs_subject_idx";--> statement-breakpoint
DROP INDEX "activity_logs_created_at_idx";--> statement-breakpoint
DROP INDEX "api_logs_is_error_idx";--> statement-breakpoint
DROP INDEX "api_logs_created_at_idx";--> statement-breakpoint
DROP INDEX "api_logs_response_status_idx";--> statement-breakpoint
DROP INDEX "connections_type_idx";--> statement-breakpoint
DROP INDEX "connections_status_idx";--> statement-breakpoint
DROP INDEX "connections_store_identifier_idx";--> statement-breakpoint
DROP INDEX "connections_deleted_at_idx";--> statement-breakpoint
DROP INDEX "connections_type_store_identifier_uq";--> statement-breakpoint
DROP INDEX "sync_jobs_connection_id_idx";--> statement-breakpoint
DROP INDEX "sync_jobs_status_idx";--> statement-breakpoint
DROP INDEX "sync_jobs_started_at_idx";--> statement-breakpoint
DROP INDEX "sync_schedules_connection_id_idx";--> statement-breakpoint
DROP INDEX "sync_schedules_enabled_idx";--> statement-breakpoint
DROP INDEX "sync_schedules_deleted_at_idx";--> statement-breakpoint
DROP INDEX "email_phrases_template_id_idx";--> statement-breakpoint
DROP INDEX "email_templates_code_unique";--> statement-breakpoint
DROP INDEX "email_templates_code_idx";--> statement-breakpoint
DROP INDEX "email_templates_status_idx";--> statement-breakpoint
DROP INDEX "integration_customers_connection_external_uq";--> statement-breakpoint
DROP INDEX "integration_customers_platform_idx";--> statement-breakpoint
DROP INDEX "integration_customers_connection_idx";--> statement-breakpoint
DROP INDEX "integration_orders_connection_external_uq";--> statement-breakpoint
DROP INDEX "integration_orders_platform_idx";--> statement-breakpoint
DROP INDEX "integration_orders_connection_idx";--> statement-breakpoint
DROP INDEX "integration_orders_placed_at_idx";--> statement-breakpoint
DROP INDEX "integration_products_connection_external_uq";--> statement-breakpoint
DROP INDEX "integration_products_platform_idx";--> statement-breakpoint
DROP INDEX "integration_products_connection_idx";--> statement-breakpoint
DROP INDEX "sync_runs_platform_idx";--> statement-breakpoint
DROP INDEX "sync_runs_target_idx";--> statement-breakpoint
DROP INDEX "sync_runs_finished_at_idx";--> statement-breakpoint
DROP INDEX "sync_runs_connection_id_idx";--> statement-breakpoint
DROP INDEX "permissions_name_idx";--> statement-breakpoint
DROP INDEX "permissions_module_idx";--> statement-breakpoint
DROP INDEX "permissions_name_action_unq";--> statement-breakpoint
DROP INDEX "role_permissions_role_id_idx";--> statement-breakpoint
DROP INDEX "role_permissions_permission_id_idx";--> statement-breakpoint
DROP INDEX "role_permissions_unq";--> statement-breakpoint
DROP INDEX "roles_name_unique";--> statement-breakpoint
DROP INDEX "roles_name_idx";--> statement-breakpoint
DROP INDEX "scope_documents_deleted_at_idx";--> statement-breakpoint
DROP INDEX "settings_key_unique";--> statement-breakpoint
DROP INDEX "settings_key_idx";--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
DROP INDEX "users_email_idx";--> statement-breakpoint
DROP INDEX "users_role_id_idx";--> statement-breakpoint
DROP INDEX "users_deleted_at_idx";--> statement-breakpoint
ALTER TABLE `client_config` ALTER COLUMN "dashboard_type" TO "dashboard_type" text NOT NULL DEFAULT 'standalone';--> statement-breakpoint
CREATE INDEX `activity_logs_user_id_idx` ON `activity_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `activity_logs_action_idx` ON `activity_logs` (`action`);--> statement-breakpoint
CREATE INDEX `activity_logs_subject_idx` ON `activity_logs` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `activity_logs_created_at_idx` ON `activity_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `api_logs_is_error_idx` ON `api_logs` (`is_error`);--> statement-breakpoint
CREATE INDEX `api_logs_created_at_idx` ON `api_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `api_logs_response_status_idx` ON `api_logs` (`response_status`);--> statement-breakpoint
CREATE INDEX `connections_type_idx` ON `integration_connections` (`type`);--> statement-breakpoint
CREATE INDEX `connections_status_idx` ON `integration_connections` (`status`);--> statement-breakpoint
CREATE INDEX `connections_store_identifier_idx` ON `integration_connections` (`store_identifier`);--> statement-breakpoint
CREATE INDEX `connections_deleted_at_idx` ON `integration_connections` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `connections_type_store_identifier_uq` ON `integration_connections` (`type`,`store_identifier`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `sync_jobs_connection_id_idx` ON `sync_jobs` (`connection_id`);--> statement-breakpoint
CREATE INDEX `sync_jobs_status_idx` ON `sync_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `sync_jobs_started_at_idx` ON `sync_jobs` (`started_at`);--> statement-breakpoint
CREATE INDEX `sync_schedules_connection_id_idx` ON `sync_schedules` (`connection_id`);--> statement-breakpoint
CREATE INDEX `sync_schedules_enabled_idx` ON `sync_schedules` (`enabled`);--> statement-breakpoint
CREATE INDEX `sync_schedules_deleted_at_idx` ON `sync_schedules` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `email_phrases_template_id_idx` ON `email_phrases` (`template_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_templates_code_unique` ON `email_templates` (`code`);--> statement-breakpoint
CREATE INDEX `email_templates_code_idx` ON `email_templates` (`code`);--> statement-breakpoint
CREATE INDEX `email_templates_status_idx` ON `email_templates` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `integration_customers_connection_external_uq` ON `integration_customers` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `integration_customers_platform_idx` ON `integration_customers` (`platform`);--> statement-breakpoint
CREATE INDEX `integration_customers_connection_idx` ON `integration_customers` (`connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `integration_orders_connection_external_uq` ON `integration_orders` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `integration_orders_platform_idx` ON `integration_orders` (`platform`);--> statement-breakpoint
CREATE INDEX `integration_orders_connection_idx` ON `integration_orders` (`connection_id`);--> statement-breakpoint
CREATE INDEX `integration_orders_placed_at_idx` ON `integration_orders` (`placed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `integration_products_connection_external_uq` ON `integration_products` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `integration_products_platform_idx` ON `integration_products` (`platform`);--> statement-breakpoint
CREATE INDEX `integration_products_connection_idx` ON `integration_products` (`connection_id`);--> statement-breakpoint
CREATE INDEX `sync_runs_platform_idx` ON `sync_runs` (`platform`);--> statement-breakpoint
CREATE INDEX `sync_runs_target_idx` ON `sync_runs` (`platform`,`target`);--> statement-breakpoint
CREATE INDEX `sync_runs_finished_at_idx` ON `sync_runs` (`finished_at`);--> statement-breakpoint
CREATE INDEX `sync_runs_connection_id_idx` ON `sync_runs` (`connection_id`);--> statement-breakpoint
CREATE INDEX `permissions_name_idx` ON `permissions` (`name`);--> statement-breakpoint
CREATE INDEX `permissions_module_idx` ON `permissions` (`module`);--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_name_action_unq` ON `permissions` (`name`,`action`);--> statement-breakpoint
CREATE INDEX `role_permissions_role_id_idx` ON `role_permissions` (`role_id`);--> statement-breakpoint
CREATE INDEX `role_permissions_permission_id_idx` ON `role_permissions` (`permission_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `role_permissions_unq` ON `role_permissions` (`role_id`,`permission_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE INDEX `roles_name_idx` ON `roles` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);--> statement-breakpoint
CREATE INDEX `settings_key_idx` ON `settings` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_id_idx` ON `users` (`role_id`);--> statement-breakpoint
CREATE INDEX `users_deleted_at_idx` ON `users` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `client_config` DROP COLUMN `plan_tier`;--> statement-breakpoint
ALTER TABLE `client_config` DROP COLUMN `user_seats`;--> statement-breakpoint
ALTER TABLE `client_config` DROP COLUMN `go_live_date`;