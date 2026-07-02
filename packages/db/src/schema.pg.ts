/**
 * Postgres (Supabase/Neon) mirror of the canonical SQLite schema (`schema.ts`),
 * for the dual-dialect port (#242). ONE-TO-ONE with the SQLite tables — same
 * table/column names, same indexes — so it is a mechanical dialect port, not a
 * schema change. Consumers keep importing the canonical types from `schema.ts`;
 * this module exists to generate + migrate the Postgres schema (proven against
 * pglite in tests) and to back the Postgres driver at runtime.
 *
 * Type mappings (documented in docs/schema-requests.md):
 *   sqlite `integer({mode:"timestamp"})`  → pg `timestamp({withTimezone:true})` (timestamptz)
 *   sqlite `integer({mode:"boolean"})`    → pg `boolean`
 *   sqlite `real`                         → pg `doublePrecision`
 *   sqlite `text` (incl. JSON-string cols)→ pg `text`  (kept as text — NO jsonb;
 *                                           consumers serialize JSON themselves,
 *                                           changing it would be a semantic change)
 *   sqlite `integer` / `text` (plain)     → pg `integer` / `text` (unchanged)
 *   sqlite `integer` holding 64-bit values → pg `bigint({mode:"number"})` — the
 *                                           estimate/size columns (`file_size_bytes`,
 *                                           `downloads_estimate`, `revenue_estimate`)
 *                                           exceed int4 range (#257); mode:"number"
 *                                           keeps the JS type `number`, matching sqlite.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  doublePrecision,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const apps = pgTable(
  "apps",
  {
    id: text("id").primaryKey(),
    store: text("store", { enum: ["apple", "google"] }).notNull(),
    storeAppId: text("store_app_id").notNull(),
    bundleId: text("bundle_id"),
    title: text("title").notNull(),
    developer: text("developer").notNull(),
    category: text("category"),
    iconUrl: text("icon_url"),
    description: text("description"),
    websiteUrl: text("website_url"),
    supportEmail: text("support_email"),
    price: doublePrecision("price"),
    contentRating: text("content_rating"),
    languages: text("languages"),
    screenshotUrls: text("screenshot_urls"),
    releasedAt: ts("released_at"),
    updatedAt: ts("updated_at"),
    firstSeenAt: ts("first_seen_at").notNull(),
    lastIngestedAt: ts("last_ingested_at"),
    lastSnapshotDate: text("last_snapshot_date"),
    lastAttemptedAt: ts("last_attempted_at"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    minOsVersion: text("min_os_version"),
    sellerName: text("seller_name"),
  },
  (t) => [
    uniqueIndex("apps_store_app_id_idx").on(t.store, t.storeAppId),
    index("apps_category_idx").on(t.category),
    index("apps_developer_idx").on(t.developer),
    index("apps_last_snapshot_idx").on(t.lastSnapshotDate),
    index("apps_last_attempted_idx").on(t.lastAttemptedAt),
    index("apps_released_at_idx").on(t.releasedAt),
  ],
);

export const appSnapshots = pgTable(
  "app_snapshots",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    snapshotDate: text("snapshot_date").notNull(),
    reviewCount: integer("review_count").notNull().default(0),
    rating: doublePrecision("rating"),
    chartRank: integer("chart_rank"),
    chartCategory: text("chart_category"),
    chartCountry: text("chart_country").default("US"),
    downloadsEstimate: bigint("downloads_estimate", { mode: "number" }),
    revenueEstimate: bigint("revenue_estimate", { mode: "number" }),
    growthScore: doublePrecision("growth_score"),
    isFirstMover: boolean("is_first_mover").default(false),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("snapshots_app_date_country_idx").on(t.appId, t.snapshotDate, t.chartCountry),
    index("snapshots_growth_idx").on(t.growthScore),
    index("snapshots_date_idx").on(t.snapshotDate),
    index("snapshots_date_reviews_app_idx").on(t.snapshotDate, t.reviewCount, t.appId),
    index("snapshots_date_rating_app_idx").on(t.snapshotDate, t.rating, t.appId),
    index("snapshots_date_rating_desc_idx").on(t.snapshotDate, sql`${t.rating} desc`, t.appId),
    index("snapshots_date_revenue_app_idx").on(t.snapshotDate, t.revenueEstimate, t.appId),
    index("snapshots_date_downloads_app_idx").on(t.snapshotDate, t.downloadsEstimate, t.appId),
    index("snapshots_chart_idx")
      .on(t.chartCountry, t.chartRank, t.appId)
      .where(sql`${t.chartRank} is not null`),
  ],
);

export const chartRankings = pgTable(
  "chart_rankings",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    store: text("store", { enum: ["apple", "google"] }).notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    country: text("country").notNull().default("US"),
    chartCategory: text("chart_category").notNull(),
    rank: integer("rank").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("chart_rankings_unique_idx").on(t.snapshotDate, t.country, t.chartCategory, t.appId),
    index("chart_rankings_read_idx").on(t.store, t.country, t.chartCategory, t.snapshotDate, t.rank),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    store: text("store", { enum: ["apple", "google"] }).notNull(),
    country: text("country").notNull().default("US"),
    rating: integer("rating").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    author: text("author"),
    reviewedAt: ts("reviewed_at").notNull(),
    ingestedAt: ts("ingested_at").notNull(),
    sentiment: text("sentiment", { enum: ["positive", "neutral", "negative", "mixed"] }),
    topics: text("topics"),
    improvementAreas: text("improvement_areas"),
  },
  (t) => [index("reviews_app_idx").on(t.appId)],
);

export const iaps = pgTable(
  "iaps",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    name: text("name").notNull(),
    price: doublePrecision("price"),
    currency: text("currency"),
  },
  (t) => [index("iaps_app_idx").on(t.appId)],
);

export const metaAds = pgTable(
  "meta_ads",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    adLibraryId: text("ad_library_id"),
    adCopy: text("ad_copy"),
    imageUrl: text("image_url"),
    videoUrl: text("video_url"),
    status: text("status"),
    firstSeenAt: ts("first_seen_at"),
    lastSeenAt: ts("last_seen_at"),
  },
  (t) => [index("meta_ads_app_idx").on(t.appId)],
);

export const appleSearchAds = pgTable(
  "apple_search_ads",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    country: text("country").notNull(),
    keyword: text("keyword").notNull(),
    rank: integer("rank"),
    observedAt: ts("observed_at").notNull(),
  },
  (t) => [index("apple_ads_app_idx").on(t.appId)],
);

export const creators = pgTable(
  "creators",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    platform: text("platform", { enum: ["tiktok", "instagram", "youtube", "other"] }).notNull(),
    handle: text("handle").notNull(),
    profileUrl: text("profile_url"),
    followerCount: integer("follower_count"),
    discoveredAt: ts("discovered_at").notNull(),
  },
  (t) => [index("creators_app_idx").on(t.appId)],
);

export const keywords = pgTable(
  "keywords",
  {
    id: text("id").primaryKey(),
    keyword: text("keyword").notNull(),
    country: text("country").notNull().default("US"),
    store: text("store", { enum: ["apple", "google"] }).notNull(),
    popularity: integer("popularity"),
    difficulty: integer("difficulty"),
    trafficScore: integer("traffic_score"),
    competingAppCount: integer("competing_app_count"),
    topResults: text("top_results"),
    computedAt: ts("computed_at").notNull(),
  },
  (t) => [uniqueIndex("keywords_unique_idx").on(t.keyword, t.country, t.store)],
);

export const keywordRankings = pgTable(
  "keyword_rankings",
  {
    id: text("id").primaryKey(),
    keywordId: text("keyword_id")
      .notNull()
      .references(() => keywords.id),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    rank: integer("rank"),
    observedAt: ts("observed_at").notNull(),
  },
  (t) => [index("keyword_rankings_keyword_idx").on(t.keywordId)],
);

export const trackedKeywords = pgTable(
  "tracked_keywords",
  {
    id: text("id").primaryKey(),
    keywordId: text("keyword_id")
      .notNull()
      .references(() => keywords.id),
    note: text("note"),
    trackedAt: ts("tracked_at").notNull(),
  },
  (t) => [uniqueIndex("tracked_keywords_keyword_idx").on(t.keywordId)],
);

export const trackedApps = pgTable(
  "tracked_apps",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    store: text("store", { enum: ["apple", "google"] }).notNull(),
    country: text("country").notNull().default("US"),
    addedAt: ts("added_at").notNull(),
    generatedKeywordCount: integer("generated_keyword_count").notNull().default(0),
    lastAnalyzedAt: ts("last_analyzed_at"),
  },
  (t) => [
    uniqueIndex("tracked_apps_unique_idx").on(t.appId, t.store, t.country),
    index("tracked_apps_added_idx").on(t.addedAt),
  ],
);

export const trackedAppKeywords = pgTable(
  "tracked_app_keywords",
  {
    id: text("id").primaryKey(),
    trackedAppId: text("tracked_app_id")
      .notNull()
      .references(() => trackedApps.id),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    store: text("store", { enum: ["apple", "google"] }).notNull(),
    country: text("country").notNull().default("US"),
    keyword: text("keyword").notNull(),
    inputHash: text("input_hash").notNull(),
    source: text("source").notNull().default("ai"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("tracked_app_keywords_unique_idx").on(t.trackedAppId, t.country, t.keyword),
    index("tracked_app_keywords_tracked_app_idx").on(t.trackedAppId),
    index("tracked_app_keywords_app_idx").on(t.appId, t.country),
  ],
);

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    subjectId: text("subject_id").notNull(),
    inputHash: text("input_hash").notNull(),
    output: text("output").notNull(),
    model: text("model").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("ai_generations_unique_idx").on(t.kind, t.subjectId, t.inputHash),
    index("ai_generations_subject_idx").on(t.subjectId),
  ],
);

export const sweepState = pgTable("sweep_state", {
  name: text("name").primaryKey(),
  lastRunAt: ts("last_run_at").notNull(),
  lastSummary: text("last_summary"),
});

export const appIdeas = pgTable(
  "app_ideas",
  {
    id: text("id").primaryKey(),
    sourceAppId: text("source_app_id")
      .notNull()
      .references(() => apps.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    sourceCategory: text("source_category").notNull(),
    ideaCategory: text("idea_category").notNull(),
    needsBackend: boolean("needs_backend").notNull(),
    needsDatabase: boolean("needs_database").notNull(),
    needsAi: boolean("needs_ai").notNull(),
    blueprint: text("blueprint").notNull(),
    reviewCount: integer("review_count").notNull().default(0),
    rating: doublePrecision("rating"),
    downloadsEstimate: bigint("downloads_estimate", { mode: "number" }),
    revenueEstimate: bigint("revenue_estimate", { mode: "number" }),
    price: doublePrecision("price"),
    releasedAt: ts("released_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("app_ideas_source_app_idx").on(t.sourceAppId),
    index("app_ideas_source_category_idx").on(t.sourceCategory),
    index("app_ideas_created_idx").on(t.createdAt),
  ],
);

export const cloneableApps = pgTable(
  "cloneable_apps",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").references(() => apps.id),
    repoUrl: text("repo_url").notNull(),
    platform: text("platform", {
      enum: ["react-native", "ios-native", "android-native", "multi"],
    }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    iconUrl: text("icon_url"),
    featuredReason: text("featured_reason").notNull(),
    expoProjectId: text("expo_project_id"),
    iosDeploymentTarget: text("ios_deployment_target"),
    githubStars: integer("github_stars"),
    syncedAt: ts("synced_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("cloneable_apps_repo_idx").on(t.repoUrl),
    index("cloneable_apps_platform_idx").on(t.platform),
    index("cloneable_apps_featured_idx").on(t.featuredReason),
  ],
);

export const builderProjects = pgTable(
  "builder_projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    blueprintJson: text("blueprint_json").notNull(),
    engine: text("engine", { enum: ["ollama", "gemini", "heuristic"] }).notNull(),
    parentProjectId: text("parent_project_id"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("builder_projects_updated_idx").on(t.updatedAt)],
);

export const builderMessages = pgTable(
  "builder_messages",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => builderProjects.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    blueprintJson: text("blueprint_json"),
    runJson: text("run_json"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("builder_messages_project_idx").on(t.projectId)],
);
