CREATE TABLE `memory_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`atomic_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`project` text,
	`rule_text` text NOT NULL,
	`applies_when` text NOT NULL,
	`does_not_apply_when` text NOT NULL,
	`source_prompt_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`source_prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_memory_rules_atomic_version` ON `memory_rules` (`atomic_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_memory_rules_status` ON `memory_rules` (`status`);--> statement-breakpoint
CREATE INDEX `idx_memory_rules_project` ON `memory_rules` (`project`);--> statement-breakpoint
CREATE TABLE `prompt_tags` (
	`prompt_id` integer PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`reaction` text NOT NULL,
	`tagger` text NOT NULL,
	`tagger_version` integer NOT NULL,
	`ts` text NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`day` text NOT NULL,
	`source` text NOT NULL,
	`session_id` text,
	`cwd` text,
	`project` text,
	`prompt` text NOT NULL,
	`model` text,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `idx_prompts_day` ON `prompts` (`day`);--> statement-breakpoint
CREATE INDEX `idx_prompts_source` ON `prompts` (`source`);--> statement-breakpoint
CREATE TABLE `rule_evidence` (
	`rule_id` integer NOT NULL,
	`prompt_id` integer NOT NULL,
	`action` text NOT NULL,
	`ts` text NOT NULL,
	PRIMARY KEY(`rule_id`, `prompt_id`),
	FOREIGN KEY (`rule_id`) REFERENCES `memory_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trace_events` (
	`prompt_id` integer PRIMARY KEY NOT NULL,
	`transcript_path` text,
	`task_text` text,
	`behavior_text` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`compiler` text,
	`compiler_version` integer,
	`error` text,
	`lease_until` text,
	`claim_token` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`ts` text NOT NULL,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_trace_events_status` ON `trace_events` (`status`);