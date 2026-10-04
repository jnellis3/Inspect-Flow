CREATE TABLE `spectora_connections` (
	`owner` text PRIMARY KEY NOT NULL,
	`api_key` text NOT NULL,
	`webhook_token` text NOT NULL,
	`auto_create` integer DEFAULT 1 NOT NULL,
	`auto_push` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_event_at` text,
	`last_event` text,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spectora_connections_token` ON `spectora_connections` (`webhook_token`);--> statement-breakpoint
CREATE TABLE `spectora_links` (
	`owner` text NOT NULL,
	`inspection_id` text NOT NULL,
	`project_id` text NOT NULL,
	`inspection_json` text NOT NULL,
	`status` text DEFAULT 'linked' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`push_attempted_at` text,
	`pushed_at` text,
	`push_error` text,
	`attachment_id` text,
	PRIMARY KEY(`owner`, `inspection_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spectora_links_project` ON `spectora_links` (`project_id`);--> statement-breakpoint
CREATE TABLE `shares` (
	`token` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX `shares_project` ON `shares` (`project_id`);
