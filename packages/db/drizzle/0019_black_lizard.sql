CREATE TABLE `tracked_app_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`tracked_app_id` text NOT NULL,
	`app_id` text NOT NULL,
	`store` text NOT NULL,
	`country` text DEFAULT 'US' NOT NULL,
	`keyword` text NOT NULL,
	`input_hash` text NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tracked_app_id`) REFERENCES `tracked_apps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_app_keywords_unique_idx` ON `tracked_app_keywords` (`tracked_app_id`,`keyword`);--> statement-breakpoint
CREATE INDEX `tracked_app_keywords_tracked_app_idx` ON `tracked_app_keywords` (`tracked_app_id`);--> statement-breakpoint
CREATE INDEX `tracked_app_keywords_app_idx` ON `tracked_app_keywords` (`app_id`,`country`);