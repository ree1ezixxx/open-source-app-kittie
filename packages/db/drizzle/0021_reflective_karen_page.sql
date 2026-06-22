DROP INDEX `tracked_app_keywords_unique_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_app_keywords_unique_idx` ON `tracked_app_keywords` (`tracked_app_id`,`country`,`keyword`);