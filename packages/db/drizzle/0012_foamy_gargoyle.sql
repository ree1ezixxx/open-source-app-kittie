CREATE TABLE `organic_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`creator_handle` text NOT NULL,
	`platform` text NOT NULL,
	`video_url` text,
	`thumbnail_url` text,
	`caption` text,
	`posted_at` integer,
	`first_seen_at` integer,
	`last_seen_at` integer,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `organic_videos_app_idx` ON `organic_videos` (`app_id`);