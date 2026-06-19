ALTER TABLE `apps` ADD `last_attempted_at` integer;--> statement-breakpoint
CREATE INDEX `apps_last_attempted_idx` ON `apps` (`last_attempted_at`);