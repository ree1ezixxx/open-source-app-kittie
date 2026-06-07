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

export type App = typeof apps.$inferSelect;
export type AppSnapshot = typeof appSnapshots.$inferSelect;
