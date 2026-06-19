ALTER TABLE `apps` ADD `last_snapshot_date` text;--> statement-breakpoint
-- Backfill (ADR 0008): seed each app's last_snapshot_date from its newest
-- snapshot so the due-driven worker prioritises genuinely-stale apps from run
-- one (NULL = never snapshotted = most due). Uses the (app_id, snapshot_date,
-- chart_country) unique index for the per-app max. One-time; safe to re-run.
UPDATE `apps` SET `last_snapshot_date` = (
  SELECT max(`snapshot_date`) FROM `app_snapshots` WHERE `app_snapshots`.`app_id` = `apps`.`id`
);--> statement-breakpoint
CREATE INDEX `apps_last_snapshot_idx` ON `apps` (`last_snapshot_date`);