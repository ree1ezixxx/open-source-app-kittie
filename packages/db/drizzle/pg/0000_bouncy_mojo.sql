CREATE TABLE "ai_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"output" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"source_app_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"source_category" text NOT NULL,
	"idea_category" text NOT NULL,
	"needs_backend" boolean NOT NULL,
	"needs_database" boolean NOT NULL,
	"needs_ai" boolean NOT NULL,
	"blueprint" text NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"rating" double precision,
	"downloads_estimate" integer,
	"revenue_estimate" integer,
	"price" double precision,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"rating" double precision,
	"chart_rank" integer,
	"chart_category" text,
	"chart_country" text DEFAULT 'US',
	"downloads_estimate" integer,
	"revenue_estimate" integer,
	"growth_score" double precision,
	"is_first_mover" boolean DEFAULT false,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apple_search_ads" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"country" text NOT NULL,
	"keyword" text NOT NULL,
	"rank" integer,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" text PRIMARY KEY NOT NULL,
	"store" text NOT NULL,
	"store_app_id" text NOT NULL,
	"bundle_id" text,
	"title" text NOT NULL,
	"developer" text NOT NULL,
	"category" text,
	"icon_url" text,
	"description" text,
	"website_url" text,
	"support_email" text,
	"price" double precision,
	"content_rating" text,
	"languages" text,
	"screenshot_urls" text,
	"released_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_ingested_at" timestamp with time zone,
	"last_snapshot_date" text,
	"last_attempted_at" timestamp with time zone,
	"file_size_bytes" integer,
	"min_os_version" text,
	"seller_name" text
);
--> statement-breakpoint
CREATE TABLE "builder_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"blueprint_json" text,
	"run_json" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builder_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"blueprint_json" text NOT NULL,
	"engine" text NOT NULL,
	"parent_project_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_rankings" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"store" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"chart_category" text NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloneable_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text,
	"repo_url" text NOT NULL,
	"platform" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"icon_url" text,
	"featured_reason" text NOT NULL,
	"expo_project_id" text,
	"ios_deployment_target" text,
	"github_stars" integer,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"profile_url" text,
	"follower_count" integer,
	"discovered_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iaps" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"name" text NOT NULL,
	"price" double precision,
	"currency" text
);
--> statement-breakpoint
CREATE TABLE "keyword_rankings" (
	"id" text PRIMARY KEY NOT NULL,
	"keyword_id" text NOT NULL,
	"app_id" text NOT NULL,
	"rank" integer,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"keyword" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"store" text NOT NULL,
	"popularity" integer,
	"difficulty" integer,
	"traffic_score" integer,
	"competing_app_count" integer,
	"top_results" text,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ads" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"ad_library_id" text,
	"ad_copy" text,
	"image_url" text,
	"video_url" text,
	"status" text,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"store" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"author" text,
	"reviewed_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"sentiment" text,
	"topics" text,
	"improvement_areas" text
);
--> statement-breakpoint
CREATE TABLE "sweep_state" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"last_summary" text
);
--> statement-breakpoint
CREATE TABLE "tracked_app_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"tracked_app_id" text NOT NULL,
	"app_id" text NOT NULL,
	"store" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"keyword" text NOT NULL,
	"input_hash" text NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"store" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"generated_keyword_count" integer DEFAULT 0 NOT NULL,
	"last_analyzed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tracked_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"keyword_id" text NOT NULL,
	"note" text,
	"tracked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_ideas" ADD CONSTRAINT "app_ideas_source_app_id_apps_id_fk" FOREIGN KEY ("source_app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_snapshots" ADD CONSTRAINT "app_snapshots_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_search_ads" ADD CONSTRAINT "apple_search_ads_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_messages" ADD CONSTRAINT "builder_messages_project_id_builder_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."builder_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_rankings" ADD CONSTRAINT "chart_rankings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloneable_apps" ADD CONSTRAINT "cloneable_apps_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iaps" ADD CONSTRAINT "iaps_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_rankings" ADD CONSTRAINT "keyword_rankings_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_rankings" ADD CONSTRAINT "keyword_rankings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_app_keywords" ADD CONSTRAINT "tracked_app_keywords_tracked_app_id_tracked_apps_id_fk" FOREIGN KEY ("tracked_app_id") REFERENCES "public"."tracked_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_app_keywords" ADD CONSTRAINT "tracked_app_keywords_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_apps" ADD CONSTRAINT "tracked_apps_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_keywords" ADD CONSTRAINT "tracked_keywords_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_generations_unique_idx" ON "ai_generations" USING btree ("kind","subject_id","input_hash");--> statement-breakpoint
CREATE INDEX "ai_generations_subject_idx" ON "ai_generations" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_ideas_source_app_idx" ON "app_ideas" USING btree ("source_app_id");--> statement-breakpoint
CREATE INDEX "app_ideas_source_category_idx" ON "app_ideas" USING btree ("source_category");--> statement-breakpoint
CREATE INDEX "app_ideas_created_idx" ON "app_ideas" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_app_date_country_idx" ON "app_snapshots" USING btree ("app_id","snapshot_date","chart_country");--> statement-breakpoint
CREATE INDEX "snapshots_growth_idx" ON "app_snapshots" USING btree ("growth_score");--> statement-breakpoint
CREATE INDEX "snapshots_date_idx" ON "app_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "snapshots_date_reviews_app_idx" ON "app_snapshots" USING btree ("snapshot_date","review_count","app_id");--> statement-breakpoint
CREATE INDEX "snapshots_date_rating_app_idx" ON "app_snapshots" USING btree ("snapshot_date","rating","app_id");--> statement-breakpoint
CREATE INDEX "snapshots_date_rating_desc_idx" ON "app_snapshots" USING btree ("snapshot_date","rating" desc,"app_id");--> statement-breakpoint
CREATE INDEX "snapshots_date_revenue_app_idx" ON "app_snapshots" USING btree ("snapshot_date","revenue_estimate","app_id");--> statement-breakpoint
CREATE INDEX "snapshots_date_downloads_app_idx" ON "app_snapshots" USING btree ("snapshot_date","downloads_estimate","app_id");--> statement-breakpoint
CREATE INDEX "snapshots_chart_idx" ON "app_snapshots" USING btree ("chart_country","chart_rank","app_id") WHERE "app_snapshots"."chart_rank" is not null;--> statement-breakpoint
CREATE INDEX "apple_ads_app_idx" ON "apple_search_ads" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apps_store_app_id_idx" ON "apps" USING btree ("store","store_app_id");--> statement-breakpoint
CREATE INDEX "apps_category_idx" ON "apps" USING btree ("category");--> statement-breakpoint
CREATE INDEX "apps_developer_idx" ON "apps" USING btree ("developer");--> statement-breakpoint
CREATE INDEX "apps_last_snapshot_idx" ON "apps" USING btree ("last_snapshot_date");--> statement-breakpoint
CREATE INDEX "apps_last_attempted_idx" ON "apps" USING btree ("last_attempted_at");--> statement-breakpoint
CREATE INDEX "apps_released_at_idx" ON "apps" USING btree ("released_at");--> statement-breakpoint
CREATE INDEX "builder_messages_project_idx" ON "builder_messages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "builder_projects_updated_idx" ON "builder_projects" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_rankings_unique_idx" ON "chart_rankings" USING btree ("snapshot_date","country","chart_category","app_id");--> statement-breakpoint
CREATE INDEX "chart_rankings_read_idx" ON "chart_rankings" USING btree ("store","country","chart_category","snapshot_date","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "cloneable_apps_repo_idx" ON "cloneable_apps" USING btree ("repo_url");--> statement-breakpoint
CREATE INDEX "cloneable_apps_platform_idx" ON "cloneable_apps" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "cloneable_apps_featured_idx" ON "cloneable_apps" USING btree ("featured_reason");--> statement-breakpoint
CREATE INDEX "creators_app_idx" ON "creators" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "iaps_app_idx" ON "iaps" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "keyword_rankings_keyword_idx" ON "keyword_rankings" USING btree ("keyword_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keywords_unique_idx" ON "keywords" USING btree ("keyword","country","store");--> statement-breakpoint
CREATE INDEX "meta_ads_app_idx" ON "meta_ads" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "reviews_app_idx" ON "reviews" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_app_keywords_unique_idx" ON "tracked_app_keywords" USING btree ("tracked_app_id","country","keyword");--> statement-breakpoint
CREATE INDEX "tracked_app_keywords_tracked_app_idx" ON "tracked_app_keywords" USING btree ("tracked_app_id");--> statement-breakpoint
CREATE INDEX "tracked_app_keywords_app_idx" ON "tracked_app_keywords" USING btree ("app_id","country");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_apps_unique_idx" ON "tracked_apps" USING btree ("app_id","store","country");--> statement-breakpoint
CREATE INDEX "tracked_apps_added_idx" ON "tracked_apps" USING btree ("added_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_keywords_keyword_idx" ON "tracked_keywords" USING btree ("keyword_id");