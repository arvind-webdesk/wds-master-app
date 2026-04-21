ALTER TABLE `sync_runs` ADD `connection_id` integer;--> statement-breakpoint
CREATE INDEX `sync_runs_connection_id_idx` ON `sync_runs` (`connection_id`);