CREATE TABLE `tracked_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword_id` text NOT NULL,
	`note` text,
	`tracked_at` integer NOT NULL,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_keywords_keyword_idx` ON `tracked_keywords` (`keyword_id`);