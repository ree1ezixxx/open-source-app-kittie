CREATE TABLE `app_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`source_app_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`source_category` text NOT NULL,
	`idea_category` text NOT NULL,
	`needs_backend` integer NOT NULL,
	`needs_database` integer NOT NULL,
	`needs_ai` integer NOT NULL,
	`blueprint` text NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`rating` real,
	`downloads_estimate` integer,
	`revenue_estimate` integer,
	`price` real,
	`released_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_ideas_source_app_idx` ON `app_ideas` (`source_app_id`);--> statement-breakpoint
CREATE INDEX `app_ideas_source_category_idx` ON `app_ideas` (`source_category`);--> statement-breakpoint
CREATE INDEX `app_ideas_created_idx` ON `app_ideas` (`created_at`);