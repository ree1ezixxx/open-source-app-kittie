CREATE TABLE `tracked_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`store` text NOT NULL,
	`country` text DEFAULT 'US' NOT NULL,
	`added_at` integer NOT NULL,
	`generated_keyword_count` integer DEFAULT 0 NOT NULL,
	`last_analyzed_at` integer,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_apps_unique_idx` ON `tracked_apps` (`app_id`,`store`,`country`);--> statement-breakpoint
CREATE INDEX `tracked_apps_added_idx` ON `tracked_apps` (`added_at`);