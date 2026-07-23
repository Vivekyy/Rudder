CREATE TABLE `prompt_branches` (
	`source` text NOT NULL,
	`session_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`prompt_text` text NOT NULL,
	`repository` text NOT NULL,
	`branch` text NOT NULL,
	`submitted_at` text NOT NULL,
	`reconciled_at` text,
	CONSTRAINT `prompt_branches_pk` PRIMARY KEY(`source`, `session_id`, `prompt_id`)
);
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_session_branches_repository_branch`;--> statement-breakpoint
CREATE INDEX `idx_prompt_branches_repository_branch` ON `prompt_branches` (`repository`,`branch`);--> statement-breakpoint
CREATE INDEX `idx_prompt_branches_session` ON `prompt_branches` (`source`,`session_id`,`submitted_at`);--> statement-breakpoint
DROP TABLE `session_branches`;