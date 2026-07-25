CREATE TABLE `mcp_tool_audit_events_next` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `site_id` text,
  `tool_name` text NOT NULL,
  `target_kind` text NOT NULL,
  `target_mcp_id` text NOT NULL,
  `target_persisted_id` text NOT NULL,
  `input_json` text NOT NULL,
  `before_json` text NOT NULL,
  `after_json` text NOT NULL,
  `affected_record_count` integer NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `mcp_tool_audit_events_next` (
  `id`,
  `user_id`,
  `site_id`,
  `tool_name`,
  `target_kind`,
  `target_mcp_id`,
  `target_persisted_id`,
  `input_json`,
  `before_json`,
  `after_json`,
  `affected_record_count`,
  `created_at`
)
SELECT
  `id`,
  `user_id`,
  `site_id`,
  `tool_name`,
  `target_kind`,
  `target_mcp_id`,
  `target_persisted_id`,
  `input_json`,
  `before_json`,
  `after_json`,
  `affected_record_count`,
  `created_at`
FROM `mcp_tool_audit_events`;
--> statement-breakpoint
DROP TABLE `mcp_tool_audit_events`;
--> statement-breakpoint
ALTER TABLE `mcp_tool_audit_events_next` RENAME TO `mcp_tool_audit_events`;
--> statement-breakpoint
CREATE INDEX `mcp_tool_audit_events_user_id_created_at_idx` ON `mcp_tool_audit_events` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `mcp_tool_audit_events_site_id_created_at_idx` ON `mcp_tool_audit_events` (`site_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `mcp_tool_audit_events_target_idx` ON `mcp_tool_audit_events` (`target_kind`, `target_persisted_id`);
