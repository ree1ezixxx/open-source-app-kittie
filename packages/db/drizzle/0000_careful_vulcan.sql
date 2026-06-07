CREATE TABLE `app_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`rating` real,
	`chart_rank` integer,
	`chart_category` text,
	`chart_country` text DEFAULT 'US',
	`downloads_estimate` integer,
	`revenue_estimate` integer,
	`growth_score` real,
	`is_first_mover` integer DEFAULT false,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_app_date_idx` ON `app_snapshots` (`app_id`,`snapshot_date`);--> statement-breakpoint
CREATE INDEX `snapshots_growth_idx` ON `app_snapshots` (`growth_score`);--> statement-breakpoint
CREATE INDEX `snapshots_date_idx` ON `app_snapshots` (`snapshot_date`);--> statement-breakpoint
CREATE TABLE `apple_search_ads` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`country` text NOT NULL,
	`keyword` text NOT NULL,
	`rank` integer,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `apple_ads_app_idx` ON `apple_search_ads` (`app_id`);--> statement-breakpoint
CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`store` text NOT NULL,
	`store_app_id` text NOT NULL,
	`bundle_id` text,
	`title` text NOT NULL,
	`developer` text NOT NULL,
	`category` text,
	`icon_url` text,
	`description` text,
	`website_url` text,
	`support_email` text,
	`price` real,
	`content_rating` text,
	`languages` text,
	`screenshot_urls` text,
	`released_at` integer,
	`updated_at` integer,
	`first_seen_at` integer NOT NULL,
	`last_ingested_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apps_store_app_id_idx` ON `apps` (`store`,`store_app_id`);--> statement-breakpoint
CREATE INDEX `apps_category_idx` ON `apps` (`category`);--> statement-breakpoint
CREATE INDEX `apps_developer_idx` ON `apps` (`developer`);--> statement-breakpoint
CREATE TABLE `creators` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`platform` text NOT NULL,
	`handle` text NOT NULL,
	`profile_url` text,
	`follower_count` integer,
	`discovered_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `creators_app_idx` ON `creators` (`app_id`);--> statement-breakpoint
CREATE TABLE `iaps` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`name` text NOT NULL,
	`price` real,
	`currency` text,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `iaps_app_idx` ON `iaps` (`app_id`);--> statement-breakpoint
CREATE TABLE `keyword_rankings` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword_id` text NOT NULL,
	`app_id` text NOT NULL,
	`rank` integer NOT NULL,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `keyword_rankings_keyword_idx` ON `keyword_rankings` (`keyword_id`);--> statement-breakpoint
CREATE TABLE `keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`country` text DEFAULT 'US' NOT NULL,
	`store` text NOT NULL,
	`popularity` integer,
	`difficulty` integer,
	`traffic_score` integer,
	`competing_app_count` integer,
	`computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keywords_unique_idx` ON `keywords` (`keyword`,`country`,`store`);--> statement-breakpoint
CREATE TABLE `meta_ads` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`ad_library_id` text,
	`ad_copy` text,
	`image_url` text,
	`video_url` text,
	`status` text,
	`first_seen_at` integer,
	`last_seen_at` integer,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `meta_ads_app_idx` ON `meta_ads` (`app_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`store` text NOT NULL,
	`country` text DEFAULT 'US' NOT NULL,
	`rating` integer NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`author` text,
	`reviewed_at` integer NOT NULL,
	`ingested_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reviews_app_idx` ON `reviews` (`app_id`);