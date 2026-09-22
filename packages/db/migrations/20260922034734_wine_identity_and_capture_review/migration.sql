ALTER TABLE `bottle_captures` ADD `review_candidate_json` text;--> statement-breakpoint
ALTER TABLE `bottle_captures` ADD `review_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `wine_vintages` ADD `vintage_status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
-- D1 keeps foreign-key enforcement enabled inside migration transactions.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_wine_vintages` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`winery_id` text,
	`brand_name` text,
	`base_name` text NOT NULL,
	`display_name` text NOT NULL,
	`designation` text,
	`vintage_year` integer,
	`vintage_status` text DEFAULT 'unknown' NOT NULL,
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
	CONSTRAINT `fk_wine_vintages_site_id_sites_id_fk` FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`),
	CONSTRAINT `wine_vintages_site_id_winery_id_wineries_fk` FOREIGN KEY (`site_id`,`winery_id`) REFERENCES `wineries`(`site_id`,`id`)
);
--> statement-breakpoint
INSERT INTO `__new_wine_vintages`(`id`, `site_id`, `winery_id`, `brand_name`, `base_name`, `display_name`, `designation`, `vintage_year`, `vintage_label`, `wine_type`, `wine_color`, `country`, `region`, `appellation`, `classification`, `address_qualification`, `alcohol_percent`, `drink_from_year`, `drink_to_year`, `description`, `drinking_advice`, `label_text`, `source_url`, `notes`, `created_at`, `updated_at`) SELECT `id`, `site_id`, `winery_id`, `brand_name`, `base_name`, `display_name`, `designation`, `vintage_year`, `vintage_label`, `wine_type`, `wine_color`, `country`, `region`, `appellation`, `classification`, `address_qualification`, `alcohol_percent`, `drink_from_year`, `drink_to_year`, `description`, `drinking_advice`, `label_text`, `source_url`, `notes`, `created_at`, `updated_at` FROM `wine_vintages`;--> statement-breakpoint
DROP TABLE `wine_vintages`;--> statement-breakpoint
ALTER TABLE `__new_wine_vintages` RENAME TO `wine_vintages`;--> statement-breakpoint
DROP INDEX IF EXISTS `wine_vintages_site_id_winery_base_vintage_unique`;--> statement-breakpoint
CREATE INDEX `wine_vintages_site_id_idx` ON `wine_vintages` (`site_id`);--> statement-breakpoint
CREATE INDEX `wine_vintages_site_id_winery_id_idx` ON `wine_vintages` (`site_id`,`winery_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wine_vintages_site_id_id_unique` ON `wine_vintages` (`site_id`,`id`);
--> statement-breakpoint
-- Legacy NV was also used for an unknown year. Do not infer non-vintage from it.
UPDATE wine_vintages SET vintage_status = CASE WHEN vintage_year IS NULL THEN 'unknown' ELSE 'year' END,
  vintage_label = CASE WHEN vintage_year IS NULL THEN 'Unknown' ELSE CAST(vintage_year AS TEXT) END;
--> statement-breakpoint
CREATE TABLE __wine_identity_fk_guard (violations INTEGER CHECK (violations = 0));
--> statement-breakpoint
INSERT INTO __wine_identity_fk_guard SELECT count(*) FROM pragma_foreign_key_check;
--> statement-breakpoint
DROP TABLE __wine_identity_fk_guard;
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
