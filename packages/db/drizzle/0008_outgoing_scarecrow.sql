CREATE TABLE `cloneable_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text,
	`repo_url` text NOT NULL,
	`platform` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`icon_url` text,
	`featured_reason` text NOT NULL,
	`expo_project_id` text,
	`ios_deployment_target` text,
	`github_stars` integer,
	`synced_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cloneable_apps_repo_idx` ON `cloneable_apps` (`repo_url`);--> statement-breakpoint
CREATE INDEX `cloneable_apps_platform_idx` ON `cloneable_apps` (`platform`);--> statement-breakpoint
CREATE INDEX `cloneable_apps_featured_idx` ON `cloneable_apps` (`featured_reason`);