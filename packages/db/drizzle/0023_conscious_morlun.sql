DROP INDEX `snapshots_date_reviews_idx`;--> statement-breakpoint
CREATE INDEX `snapshots_date_reviews_app_idx` ON `app_snapshots` (`snapshot_date`,`review_count`,`app_id`);