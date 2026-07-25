CREATE TABLE `wine_awards` (
  `id` text PRIMARY KEY NOT NULL,
  `site_id` text NOT NULL,
  `wine_vintage_id` text NOT NULL,
  `award_name` text NOT NULL,
  `award_level` text NOT NULL,
  `award_year` integer,
  `award_body` text,
  `category` text,
  `points` real,
  `source_url` text,
  `provenance` text,
  `notes` text,
  `created_by_user_id` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`site_id`, `wine_vintage_id`) REFERENCES `wine_vintages`(`site_id`, `id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wine_awards_site_id_wine_vintage_id_idx` ON `wine_awards` (`site_id`, `wine_vintage_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `wine_awards_site_wine_award_unique` ON `wine_awards` (`site_id`, `wine_vintage_id`, `award_name`, `award_level`, `award_year`);
