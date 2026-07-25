CREATE TABLE `r2_object_deletion_queue` (
  `r2_key` text PRIMARY KEY NOT NULL,
  `source_kind` text NOT NULL,
  `source_id` text NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_error` text,
  `last_attempt_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `r2_object_deletion_queue_attempts_created_at_idx` ON `r2_object_deletion_queue` (`attempts`, `created_at`);
