CREATE TABLE `builder_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`blueprint_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `builder_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `builder_messages_project_idx` ON `builder_messages` (`project_id`);--> statement-breakpoint
CREATE TABLE `builder_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`blueprint_json` text NOT NULL,
	`engine` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `builder_projects_updated_idx` ON `builder_projects` (`updated_at`);