ALTER TABLE `image_assets` ADD `thumbnail_r2_key` text;
--> statement-breakpoint
ALTER TABLE `image_assets` ADD `thumbnail_content_type` text;
--> statement-breakpoint
ALTER TABLE `image_assets` ADD `thumbnail_size_bytes` integer;
--> statement-breakpoint
ALTER TABLE `image_assets` ADD `thumbnail_width` integer;
--> statement-breakpoint
ALTER TABLE `image_assets` ADD `thumbnail_height` integer;
--> statement-breakpoint
ALTER TABLE `bottle_capture_runs` ADD `extraction_r2_key` text;
--> statement-breakpoint
ALTER TABLE `bottle_capture_runs` ADD `extraction_content_type` text;
--> statement-breakpoint
ALTER TABLE `bottle_capture_runs` ADD `extraction_size_bytes` integer;
--> statement-breakpoint
ALTER TABLE `bottle_capture_runs` ADD `error_detail_r2_key` text;
--> statement-breakpoint
ALTER TABLE `bottle_capture_runs` ADD `error_detail_content_type` text;
--> statement-breakpoint
ALTER TABLE `bottle_capture_runs` ADD `error_detail_size_bytes` integer;
