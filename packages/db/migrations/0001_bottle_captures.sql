CREATE TABLE `image_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `site_id` text NOT NULL,
  `sha256` text NOT NULL,
  `r2_key` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `width` integer,
  `height` integer,
  `uploaded_by_user_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `image_assets_site_id_idx` ON `image_assets` (`site_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_assets_site_id_sha256_unique` ON `image_assets` (`site_id`, `sha256`);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_assets_r2_key_unique` ON `image_assets` (`r2_key`);
--> statement-breakpoint
CREATE TABLE `bottle_captures` (
  `id` text PRIMARY KEY NOT NULL,
  `site_id` text NOT NULL,
  `user_id` text NOT NULL,
  `storage_location_id` text,
  `position_hint` text,
  `quantity` integer DEFAULT 1 NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `workflow_instance_id` text,
  `imported_bottle_ids_json` text,
  `error_message` text,
  `error_detail_json` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`site_id`, `storage_location_id`) REFERENCES `storage_locations`(`site_id`, `id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bottle_captures_site_id_status_idx` ON `bottle_captures` (`site_id`, `status`);
--> statement-breakpoint
CREATE INDEX `bottle_captures_user_id_idx` ON `bottle_captures` (`user_id`);
--> statement-breakpoint
CREATE TABLE `bottle_capture_images` (
  `capture_id` text NOT NULL,
  `image_asset_id` text NOT NULL,
  `sort_order` integer NOT NULL,
  `original_filename` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (`capture_id`, `sort_order`),
  FOREIGN KEY (`capture_id`) REFERENCES `bottle_captures`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`image_asset_id`) REFERENCES `image_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bottle_capture_images_image_asset_id_idx` ON `bottle_capture_images` (`image_asset_id`);
--> statement-breakpoint
CREATE TABLE `bottle_capture_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `capture_id` text NOT NULL,
  `status` text NOT NULL,
  `image_text_json` text,
  `canonical_extraction_json` text,
  `import_candidate_json` text,
  `match_result_json` text,
  `import_result_json` text,
  `extractor_version` text NOT NULL,
  `model` text,
  `prompt_version` text NOT NULL,
  `schema_version` text NOT NULL,
  `attempt_number` integer DEFAULT 1 NOT NULL,
  `error_message` text,
  `error_detail_json` text,
  `started_at` text,
  `completed_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`capture_id`) REFERENCES `bottle_captures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bottle_capture_runs_capture_id_idx` ON `bottle_capture_runs` (`capture_id`);
--> statement-breakpoint
CREATE INDEX `bottle_capture_runs_status_idx` ON `bottle_capture_runs` (`status`);
--> statement-breakpoint
ALTER TABLE `label_extractions` ADD `capture_id` text REFERENCES `bottle_captures`(`id`);
--> statement-breakpoint
ALTER TABLE `label_extractions` ADD `capture_run_id` text REFERENCES `bottle_capture_runs`(`id`);
--> statement-breakpoint
CREATE INDEX `label_extractions_capture_id_idx` ON `label_extractions` (`capture_id`);
--> statement-breakpoint
CREATE INDEX `label_extractions_capture_run_id_idx` ON `label_extractions` (`capture_run_id`);
