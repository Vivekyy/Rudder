ALTER TABLE `memory_rules` ADD `enforced` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `trace_events` ADD `turn_id` text;--> statement-breakpoint
ALTER TABLE `trace_events` ADD `hook_prompt_id` text;--> statement-breakpoint
ALTER TABLE `trace_events` ADD `applicable_atomic_ids` text;--> statement-breakpoint
ALTER TABLE `trace_events` ADD `applicability_reason` text;--> statement-breakpoint
ALTER TABLE `trace_events` ADD `applicability_agent` text;--> statement-breakpoint
ALTER TABLE `trace_events` ADD `applicability_version` integer;--> statement-breakpoint
ALTER TABLE `trace_events` ADD `applicability_ts` text;--> statement-breakpoint
CREATE TABLE `trace_verifications` (
	`prompt_id` integer NOT NULL,
	`attempt` integer NOT NULL,
	`enforced` integer NOT NULL,
	`reason` text NOT NULL,
	`verdicts` text NOT NULL,
	`blocked` integer NOT NULL,
	`verifier` text NOT NULL,
	`verifier_version` integer NOT NULL,
	`ts` text NOT NULL,
	PRIMARY KEY(`prompt_id`, `attempt`),
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
