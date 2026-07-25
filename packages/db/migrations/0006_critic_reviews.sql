CREATE TABLE `review_sources` (
  `id` text PRIMARY KEY NOT NULL,
  `site_id` text,
  `name` text NOT NULL,
  `source_type` text DEFAULT 'critic' NOT NULL,
  `url` text,
  `notes` text,
  `is_active` integer DEFAULT true NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_sources_site_id_idx` ON `review_sources` (`site_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_sources_site_id_id_unique` ON `review_sources` (`site_id`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_sources_site_id_name_unique` ON `review_sources` (`site_id`, `name`);
--> statement-breakpoint
CREATE TABLE `critic_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `site_id` text NOT NULL,
  `wine_vintage_id` text NOT NULL,
  `review_source_id` text NOT NULL,
  `rating_text` text NOT NULL,
  `rating_value` real,
  `rating_scale` text,
  `source_url` text,
  `reviewed_at` text,
  `provenance` text,
  `notes` text,
  `created_by_user_id` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`review_source_id`) REFERENCES `review_sources`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`site_id`, `wine_vintage_id`) REFERENCES `wine_vintages`(`site_id`, `id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `critic_reviews_site_id_wine_vintage_id_idx` ON `critic_reviews` (`site_id`, `wine_vintage_id`);
--> statement-breakpoint
CREATE INDEX `critic_reviews_review_source_id_idx` ON `critic_reviews` (`review_source_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `critic_reviews_site_wine_source_unique` ON `critic_reviews` (`site_id`, `wine_vintage_id`, `review_source_id`);
