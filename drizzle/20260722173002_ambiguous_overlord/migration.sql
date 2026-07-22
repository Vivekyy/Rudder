CREATE TABLE `session_branches` (
	`source` text NOT NULL,
	`session_id` text NOT NULL,
	`repository` text NOT NULL,
	`branch` text NOT NULL,
	`observed_at` text NOT NULL,
	CONSTRAINT `session_branches_pk` PRIMARY KEY(`source`, `session_id`, `repository`, `branch`)
);
--> statement-breakpoint
CREATE INDEX `idx_session_branches_repository_branch` ON `session_branches` (`repository`,`branch`);