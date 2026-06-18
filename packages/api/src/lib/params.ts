import type { AppSearchParams } from "@kittie/types";
import { z } from "zod";

const boolFromQuery = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((v) => (v === "true" || v === true ? true : v === "false" || v === false ? false : undefined));

const textSearchField = z.enum(["title", "developer", "description"]);

const searchParamsSchema = z.object({
  search: z.string().optional(),
  textSearchFields: z
    .string()
    .optional()
    .transform((raw) => {
      if (!raw) return undefined;
      const fields = raw
        .split(",")
        .map((f) => f.trim().toLowerCase())
        .filter(Boolean);
      const valid = fields.filter((f) => textSearchField.options.includes(f as "title" | "developer" | "description"));
      return valid.length ? valid.join(",") : undefined;
    }),
  categories: z.string().optional(),
  excludedCategories: z.string().optional(),
  source: z.enum(["apple", "google"]).optional(),
  excludedSource: z.enum(["apple", "google"]).optional(),
  minDownloads: z.coerce.number().optional(),
  maxDownloads: z.coerce.number().optional(),
  minRevenue: z.coerce.number().optional(),
  maxRevenue: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  maxRating: z.coerce.number().optional(),
  minReviews: z.coerce.number().optional(),
  maxReviews: z.coerce.number().optional(),
  priceType: z.enum(["all", "free", "paid"]).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  growthPeriod: z.enum(["7d", "14d", "30d", "60d", "90d"]).optional(),
  growthType: z.enum(["all", "positive", "negative"]).optional(),
  minGrowth: z.coerce.number().optional(),
  maxGrowth: z.coerce.number().optional(),
  hasMetaAds: boolFromQuery,
  hasAppleAds: boolFromQuery,
  hasCreators: boolFromQuery,
  hasEmails: boolFromQuery,
  hasWebsite: boolFromQuery,
  contentRating: z.string().optional(),
  languages: z.string().optional(),
  developer: z.string().optional(),
  releasedAfter: z.coerce.number().optional(),
  updatedAfter: z.coerce.number().optional(),
  sortBy: z
    .enum([
      "growth",
      "rating",
      "reviews",
      "updated",
      "released",
      "downloads",
      "revenue",
      "trending",
      "newest",
      "rankDelta",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export function parseAppSearchParams(query: Record<string, string>): AppSearchParams {
  return searchParamsSchema.parse(query);
}
