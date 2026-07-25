CREATE TABLE `bottle_locations` (
	`bottle_id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`storage_location_id` text NOT NULL,
	`position_hint` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bottle_id`) REFERENCES `bottles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`site_id`,`storage_location_id`) REFERENCES `storage_locations`(`site_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bottle_locations_site_id_location_id_idx` ON `bottle_locations` (`site_id`,`storage_location_id`);--> statement-breakpoint
CREATE TABLE `bottles` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`wine_vintage_id` text NOT NULL,
	`bottle_number` text,
	`volume_ml` integer DEFAULT 750 NOT NULL,
	`barcode` text,
	`lot_code` text,
	`status` text DEFAULT 'in_stock' NOT NULL,
	`acquired_at` text,
	`purchase_price` real,
	`purchase_currency` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`site_id`,`wine_vintage_id`) REFERENCES `wine_vintages`(`site_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bottles_site_id_wine_vintage_id_idx` ON `bottles` (`site_id`,`wine_vintage_id`);--> statement-breakpoint
CREATE TABLE `grape_varieties` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grape_varieties_name_unique` ON `grape_varieties` (`name`);--> statement-breakpoint
CREATE TABLE `label_extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`bottle_id` text,
	`wine_vintage_id` text,
	`provider` text,
	`model` text,
	`raw_text_json` text,
	`extracted_fields_json` text NOT NULL,
	`confidence` real,
	`requires_review` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bottle_id`) REFERENCES `bottles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wine_vintage_id`) REFERENCES `wine_vintages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `label_extractions_bottle_id_idx` ON `label_extractions` (`bottle_id`);--> statement-breakpoint
CREATE INDEX `label_extractions_wine_vintage_id_idx` ON `label_extractions` (`wine_vintage_id`);--> statement-breakpoint
CREATE TABLE `site_memberships` (
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`site_id`, `user_id`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `site_memberships_user_id_idx` ON `site_memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storage_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`location_type` text DEFAULT 'area' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`site_id`,`parent_id`) REFERENCES `storage_locations`(`site_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `storage_locations_site_id_idx` ON `storage_locations` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_locations_site_id_id_unique` ON `storage_locations` (`site_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `storage_locations_site_parent_name_unique` ON `storage_locations` (`site_id`,`parent_id`,`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_id_unique` ON `users` (`clerk_user_id`);--> statement-breakpoint
CREATE TABLE `wine_constituents` (
	`site_id` text NOT NULL,
	`wine_vintage_id` text NOT NULL,
	`grape_variety_id` text NOT NULL,
	`blend_text` text,
	`percentage` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`wine_vintage_id`, `grape_variety_id`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grape_variety_id`) REFERENCES `grape_varieties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`site_id`,`wine_vintage_id`) REFERENCES `wine_vintages`(`site_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wine_constituents_grape_variety_id_idx` ON `wine_constituents` (`grape_variety_id`);--> statement-breakpoint
CREATE TABLE `wine_vintages` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`winery_id` text NOT NULL,
	`brand_name` text,
	`base_name` text NOT NULL,
	`display_name` text NOT NULL,
	`designation` text,
	`vintage_year` integer,
	`vintage_label` text NOT NULL,
	`wine_type` text,
	`wine_color` text,
	`country` text,
	`region` text,
	`appellation` text,
	`classification` text,
	`address_qualification` text,
	`alcohol_percent` real,
	`drink_from_year` integer,
	`drink_to_year` integer,
	`description` text,
	`drinking_advice` text,
	`label_text` text,
	`source_url` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`site_id`,`winery_id`) REFERENCES `wineries`(`site_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wine_vintages_site_id_idx` ON `wine_vintages` (`site_id`);--> statement-breakpoint
CREATE INDEX `wine_vintages_site_id_winery_id_idx` ON `wine_vintages` (`site_id`,`winery_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wine_vintages_site_id_id_unique` ON `wine_vintages` (`site_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wine_vintages_site_id_winery_base_vintage_unique` ON `wine_vintages` (`site_id`,`winery_id`,`base_name`,`vintage_label`);--> statement-breakpoint
CREATE TABLE `wineries` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`address_text` text,
	`country` text,
	`region` text,
	`established_year` integer,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wineries_site_id_idx` ON `wineries` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wineries_site_id_id_unique` ON `wineries` (`site_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wineries_site_id_name_region_unique` ON `wineries` (`site_id`,`name`,`region`);