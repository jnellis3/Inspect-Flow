-- Multi-tenancy. A workspace is one inspection company: its members share its projects and its
-- company profile (name, phone, website, brand color). Every account belongs to one workspace.
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`profile` text DEFAULT '{}' NOT NULL,
	`plan` text DEFAULT 'trial' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `app_users` ADD `workspace_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `app_users` ADD `role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
CREATE INDEX `app_users_workspace` ON `app_users` (`workspace_id`);--> statement-breakpoint
-- One-time links that let a teammate create an account in the workspace.
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`workspace_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_workspace` ON `invites` (`workspace_id`);--> statement-breakpoint
-- One row per project sent for a video; a plan's video allowance counts these. Rows outlive their
-- projects, so deleting a project doesn't give the video back.
CREATE TABLE `videos` (
	`project_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `videos_workspace` ON `videos` (`workspace_id`);--> statement-breakpoint
-- Each existing account becomes the owner of its own workspace (same id, so its projects need no
-- update), named and branded from its latest project. These accounts predate the free-trial
-- allowance, so they keep unlimited videos.
INSERT INTO `workspaces` (`id`, `name`, `profile`, `plan`, `created_at`)
SELECT u.`id`,
	COALESCE(NULLIF(TRIM(json_extract(p.`data`, '$.company.name')), ''), u.`username`),
	json_object(
		'phone', COALESCE(json_extract(p.`data`, '$.company.phone'), ''),
		'website', COALESCE(json_extract(p.`data`, '$.company.website'), ''),
		'accent', COALESCE(json_extract(p.`data`, '$.company.accent'), '')),
	'unlimited', u.`created_at`
FROM `app_users` u
LEFT JOIN `projects` p ON p.`id` = (SELECT `id` FROM `projects` WHERE `owner` = u.`id` ORDER BY `updated_at` DESC LIMIT 1);
--> statement-breakpoint
UPDATE `app_users` SET `workspace_id` = `id`, `role` = 'owner';--> statement-breakpoint
ALTER TABLE `projects` RENAME COLUMN `owner` TO `workspace_id`;--> statement-breakpoint
DROP INDEX `projects_owner_updated`;--> statement-breakpoint
CREATE INDEX `projects_workspace_updated` ON `projects` (`workspace_id`,`updated_at`);
--> statement-breakpoint
-- A company's Spectora connection, its inspection links and its public watch links belong to the
-- workspace too. Account ids became workspace ids above, so only the column names change.
ALTER TABLE `spectora_connections` RENAME COLUMN `owner` TO `workspace_id`;--> statement-breakpoint
ALTER TABLE `spectora_links` RENAME COLUMN `owner` TO `workspace_id`;--> statement-breakpoint
ALTER TABLE `shares` RENAME COLUMN `owner` TO `workspace_id`;
