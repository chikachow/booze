CREATE TABLE `mcp_tool_audit_events` (
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
CREATE INDEX `mcp_tool_audit_events_user_id_created_at_idx` ON `mcp_tool_audit_events` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `mcp_tool_audit_events_site_id_created_at_idx` ON `mcp_tool_audit_events` (`site_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `mcp_tool_audit_events_target_idx` ON `mcp_tool_audit_events` (`target_kind`, `target_persisted_id`);
