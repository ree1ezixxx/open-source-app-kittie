ALTER TABLE "app_ideas" ALTER COLUMN "downloads_estimate" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "app_ideas" ALTER COLUMN "revenue_estimate" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "app_snapshots" ALTER COLUMN "downloads_estimate" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "app_snapshots" ALTER COLUMN "revenue_estimate" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "apps" ALTER COLUMN "file_size_bytes" SET DATA TYPE bigint;