CREATE TABLE `ai_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`output` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_generations_unique_idx` ON `ai_generations` (`kind`,`subject_id`,`input_hash`);--> statement-breakpoint
CREATE INDEX `ai_generations_subject_idx` ON `ai_generations` (`subject_id`);