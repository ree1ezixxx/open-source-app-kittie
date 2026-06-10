import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/** One store listing. Same product on two stores = two rows. */
export const apps = sqliteTable(
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
    price: real("price"),
    contentRating: text("content_rating"),
    languages: text("languages"), // JSON array
    screenshotUrls: text("screenshot_urls"), // JSON array
    releasedAt: integer("released_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).notNull(),
    lastIngestedAt: integer("last_ingested_at", { mode: "timestamp" }),
    // Listing facts (App Detail parity) — lazily backfilled from Apple lookup
    // on first detail view; null until then and always null for Google apps.
    fileSizeBytes: integer("file_size_bytes"),
    minOsVersion: text("min_os_version"),
    sellerName: text("seller_name"),
  },
  (t) => [
    uniqueIndex("apps_store_app_id_idx").on(t.store, t.storeAppId),
    index("apps_category_idx").on(t.category),
    index("apps_developer_idx").on(t.developer),
  ],
);

/** Point-in-time metrics — trend detection compares rows. */
export const appSnapshots = sqliteTable(
  "app_snapshots",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    snapshotDate: text("snapshot_date").notNull(), // YYYY-MM-DD
    reviewCount: integer("review_count").notNull().default(0),
    rating: real("rating"),
    chartRank: integer("chart_rank"),
    chartCategory: text("chart_category"),
    chartCountry: text("chart_country").default("US"),
    downloadsEstimate: integer("downloads_estimate"),
    revenueEstimate: integer("revenue_estimate"),
    growthScore: real("growth_score"),
    isFirstMover: integer("is_first_mover", { mode: "boolean" }).default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("snapshots_app_date_idx").on(t.appId, t.snapshotDate),
    index("snapshots_growth_idx").on(t.growthScore),
    index("snapshots_date_idx").on(t.snapshotDate),
  ],
);

export const reviews = sqliteTable(
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
    reviewedAt: integer("reviewed_at", { mode: "timestamp" }).notNull(),
    ingestedAt: integer("ingested_at", { mode: "timestamp" }).notNull(),
    // Persisted classification — written once at ingest by the classifier seam.
    // Null on legacy rows ingested before tagging; a sweep backfills them.
    sentiment: text("sentiment", { enum: ["positive", "neutral", "negative", "mixed"] }),
    topics: text("topics"), // JSON array
    improvementAreas: text("improvement_areas"), // JSON array
  },
  (t) => [index("reviews_app_idx").on(t.appId)],
);

export const iaps = sqliteTable(
  "iaps",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    name: text("name").notNull(),
    price: real("price"),
    currency: text("currency"),
  },
  (t) => [index("iaps_app_idx").on(t.appId)],
);

export const metaAds = sqliteTable(
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
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" }),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  },
  (t) => [index("meta_ads_app_idx").on(t.appId)],
);

export const appleSearchAds = sqliteTable(
  "apple_search_ads",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    country: text("country").notNull(),
    keyword: text("keyword").notNull(),
    rank: integer("rank"),
    observedAt: integer("observed_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("apple_ads_app_idx").on(t.appId)],
);

export const creators = sqliteTable(
  "creators",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    platform: text("platform", {
      enum: ["tiktok", "instagram", "youtube", "other"],
    }).notNull(),
    handle: text("handle").notNull(),
    profileUrl: text("profile_url"),
    followerCount: integer("follower_count"),
    discoveredAt: integer("discovered_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("creators_app_idx").on(t.appId)],
);

export const keywords = sqliteTable(
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
    /** JSON: top search results at last sync (title, icon, reviews, rank). */
    topResults: text("top_results"),
    computedAt: integer("computed_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("keywords_unique_idx").on(t.keyword, t.country, t.store),
  ],
);

export const keywordRankings = sqliteTable(
  "keyword_rankings",
  {
    id: text("id").primaryKey(),
    keywordId: text("keyword_id")
      .notNull()
      .references(() => keywords.id),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    rank: integer("rank").notNull(),
    observedAt: integer("observed_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("keyword_rankings_keyword_idx").on(t.keywordId)],
);

/**
 * The user's durable keyword shortlist. A tracked keyword references its lookup
 * row for current metrics but persists independently — never cache-evicted. One
 * row per tracked keyword (unique on keywordId). See ADR 0003.
 */
export const trackedKeywords = sqliteTable(
  "tracked_keywords",
  {
    id: text("id").primaryKey(),
    keywordId: text("keyword_id")
      .notNull()
      .references(() => keywords.id),
    note: text("note"),
    trackedAt: integer("tracked_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("tracked_keywords_keyword_idx").on(t.keywordId)],
);

/**
 * Cache of AI-generated artifacts (Gemini). One row per generated output, keyed
 * by kind + subject + a hash of the generation input. Generated once, read
 * forever — per-view regeneration is never allowed (ADR 0005); user-triggered
 * kinds (translation, art direction) re-use the row when the same input recurs.
 */
export const aiGenerations = sqliteTable(
  "ai_generations",
  {
    id: text("id").primaryKey(),
    /** e.g. 'app_about' | 'art_direction' | 'translation' | 'idea_blueprint' */
    kind: text("kind").notNull(),
    /** What the output is about — usually an app id. */
    subjectId: text("subject_id").notNull(),
    /** Hash of the generation input so changed inputs produce a new row. */
    inputHash: text("input_hash").notNull(),
    /** JSON or plain-text model output. */
    output: text("output").notNull(),
    model: text("model").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("ai_generations_unique_idx").on(t.kind, t.subjectId, t.inputHash),
    index("ai_generations_subject_idx").on(t.subjectId),
  ],
);

/**
 * Last-run bookkeeping for the freshness scheduler (ADR 0004). One row per
 * registered sweep; persisted so the boot catch-up sweep knows what is stale
 * across API restarts.
 */
export const sweepState = sqliteTable("sweep_state", {
  name: text("name").primaryKey(),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }).notNull(),
  /** Short human summary of the last run (e.g. "refreshed 12, +340 reviews"). */
  lastSummary: text("last_summary"),
});

/**
 * Hot ideas (ADR 0005): one AI-generated app concept per source App,
 * pre-generated in batch and stored — never generated per view. Sort metrics
 * are denormalized from the source App at generation time because the display
 * sort is always absolute (Created/Released/Reviews/Downloads/Revenue/Rating/
 * Price), never growth.
 */
export const appIdeas = sqliteTable(
  "app_ideas",
  {
    id: text("id").primaryKey(),
    sourceAppId: text("source_app_id")
      .notNull()
      .references(() => apps.id),
    /** URL slug for /dashboard/hot-ideas/app-<slug>-id<storeAppId>. */
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    /** App-Store category of the source App (denormalized). */
    sourceCategory: text("source_category").notNull(),
    /** What kind of product the idea itself is (e.g. "AI Tool"). */
    ideaCategory: text("idea_category").notNull(),
    needsBackend: integer("needs_backend", { mode: "boolean" }).notNull(),
    needsDatabase: integer("needs_database", { mode: "boolean" }).notNull(),
    needsAi: integer("needs_ai", { mode: "boolean" }).notNull(),
    /** Full Blueprint JSON: difficulty, timeline, features, architecture, … */
    blueprint: text("blueprint").notNull(),
    // Denormalized sort metrics from the source App's latest Snapshot.
    reviewCount: integer("review_count").notNull().default(0),
    rating: real("rating"),
    downloadsEstimate: integer("downloads_estimate"),
    revenueEstimate: integer("revenue_estimate"),
    price: real("price"),
    releasedAt: integer("released_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("app_ideas_source_app_idx").on(t.sourceAppId),
    index("app_ideas_source_category_idx").on(t.sourceCategory),
    index("app_ideas_created_idx").on(t.createdAt),
  ],
);

export type App = typeof apps.$inferSelect;
export type AppSnapshot = typeof appSnapshots.$inferSelect;
export type TrackedKeyword = typeof trackedKeywords.$inferSelect;
export type AiGeneration = typeof aiGenerations.$inferSelect;
export type SweepState = typeof sweepState.$inferSelect;
export type AppIdea = typeof appIdeas.$inferSelect;
