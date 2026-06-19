CREATE TABLE `chart_rankings` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`store` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`country` text DEFAULT 'US' NOT NULL,
	`chart_category` text NOT NULL,
	`rank` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chart_rankings_unique_idx` ON `chart_rankings` (`snapshot_date`,`country`,`chart_category`,`app_id`);--> statement-breakpoint
CREATE INDEX `chart_rankings_read_idx` ON `chart_rankings` (`store`,`country`,`chart_category`,`snapshot_date`,`rank`);