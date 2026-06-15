CREATE TABLE `sweep_state` (
	`name` text PRIMARY KEY NOT NULL,
	`last_run_at` integer NOT NULL,
	`last_summary` text
);
