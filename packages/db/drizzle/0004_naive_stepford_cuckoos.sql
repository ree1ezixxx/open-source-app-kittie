CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`rule` text NOT NULL,
	`threshold` real,
	`enabled` integer DEFAULT true NOT NULL,
	`channels` text DEFAULT '["feed"]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`app_change_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_change_id`) REFERENCES `app_changes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `alerts_created_idx` ON `alerts` (`created_at`);--> statement-breakpoint
CREATE INDEX `alerts_unread_idx` ON `alerts` (`read_at`);--> statement-breakpoint
CREATE TABLE `app_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`prior_at` integer NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `app_changes_app_time_idx` ON `app_changes` (`app_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `app_changes_field_idx` ON `app_changes` (`field`);--> statement-breakpoint
CREATE TABLE `job_cursors` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracked_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`note` text,
	`tracked_at` integer NOT NULL,
	`last_capture` text,
	`last_captured_at` integer,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_apps_app_idx` ON `tracked_apps` (`app_id`);