PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_keyword_rankings` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword_id` text NOT NULL,
	`app_id` text NOT NULL,
	`rank` integer,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_keyword_rankings`("id", "keyword_id", "app_id", "rank", "observed_at") SELECT "id", "keyword_id", "app_id", "rank", "observed_at" FROM `keyword_rankings`;--> statement-breakpoint
DROP TABLE `keyword_rankings`;--> statement-breakpoint
ALTER TABLE `__new_keyword_rankings` RENAME TO `keyword_rankings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `keyword_rankings_keyword_idx` ON `keyword_rankings` (`keyword_id`);