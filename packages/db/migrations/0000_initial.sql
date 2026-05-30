CREATE TABLE `locations` (
	`site_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `locations_site_id_idx` ON `locations` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `locations_site_id_id_unique` ON `locations` (`site_id`,`id`);--> statement-breakpoint
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
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_id_unique` ON `users` (`clerk_user_id`);--> statement-breakpoint
CREATE TABLE `wine_bottles` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`location_id` text NOT NULL,
	`wine_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`site_id`,`location_id`) REFERENCES `locations`(`site_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`site_id`,`wine_id`) REFERENCES `wines`(`site_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wine_bottles_site_id_location_id_idx` ON `wine_bottles` (`site_id`,`location_id`);--> statement-breakpoint
CREATE INDEX `wine_bottles_site_id_wine_id_idx` ON `wine_bottles` (`site_id`,`wine_id`);--> statement-breakpoint
CREATE TABLE `wines` (
	`site_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`producer` text NOT NULL,
	`name` text NOT NULL,
	`varietal` text,
	`vintage` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wines_site_id_idx` ON `wines` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wines_site_id_id_unique` ON `wines` (`site_id`,`id`);