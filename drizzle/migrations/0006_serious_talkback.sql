DROP INDEX `integration_customers_platform_external_uq`;--> statement-breakpoint
ALTER TABLE `integration_customers` ADD `connection_id` integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `integration_customers_connection_external_uq` ON `integration_customers` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `integration_customers_connection_idx` ON `integration_customers` (`connection_id`);--> statement-breakpoint
DROP INDEX `integration_orders_platform_external_uq`;--> statement-breakpoint
ALTER TABLE `integration_orders` ADD `connection_id` integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `integration_orders_connection_external_uq` ON `integration_orders` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `integration_orders_connection_idx` ON `integration_orders` (`connection_id`);--> statement-breakpoint
DROP INDEX `integration_products_platform_external_uq`;--> statement-breakpoint
ALTER TABLE `integration_products` ADD `connection_id` integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `integration_products_connection_external_uq` ON `integration_products` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `integration_products_connection_idx` ON `integration_products` (`connection_id`);