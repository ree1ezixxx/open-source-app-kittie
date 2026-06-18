DROP INDEX `snapshots_app_date_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_app_date_country_idx` ON `app_snapshots` (`app_id`,`snapshot_date`,`chart_country`);