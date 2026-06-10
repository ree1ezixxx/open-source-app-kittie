import gplay from "google-play-scraper";
import { apps, createDb } from "@kittie/db";
import { eq, sql } from "drizzle-orm";

import { upsertApp, upsertSnapshot } from "../db/apps.js";
import { fetchGoogleAppMetadata } from "../google/metadata.js";
import { todaySnapshotDate } from "../util/dates.js";
import { sleep } from "../util/rate-limit.js";

/* ============================================================
   Google Play expansion sweep (post-parity): grow Google coverage to
   ~TARGET_TOTAL apps by walking top-free / top-grossing charts across
   every Play category. Paced, idempotent (upsert-only), capped per run
   — accumulates across scheduler runs and stops at the target.
   ============================================================ */

export const GOOGLE_TARGET_TOTAL = 5_000;
const NEW_APPS_PER_RUN = 400;
const PER_CATEGORY = 100;
const LIST_GAP_MS = 600;
const METADATA_GAP_MS = 150;

const constants = gplay as typeof gplay & {
  collection: { TOP_FREE: string; GROSSING: string };
  category: Record<string, string>;
};

export interface GoogleExpandResult {
  totalGoogle: number;
  added: number;
  target: number;
}

export async function runGoogleExpand(): Promise<GoogleExpandResult> {
  const db = createDb();
  const count = async () => {
    const rows = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(apps)
      .where(eq(apps.store, "google"));
    return rows[0]?.n ?? 0;
  };

  let total = await count();
  if (total >= GOOGLE_TARGET_TOTAL) {
    return { totalGoogle: total, added: 0, target: GOOGLE_TARGET_TOTAL };
  }

  const existing = new Set(
    (
      await db
        .select({ storeAppId: apps.storeAppId })
        .from(apps)
        .where(eq(apps.store, "google"))
    ).map((r) => r.storeAppId),
  );

  const categories = Object.values(constants.category);
  const collections = [constants.collection.TOP_FREE, constants.collection.GROSSING];
  const snapshotDate = todaySnapshotDate();
  let added = 0;

  outer: for (const category of categories) {
    for (const collection of collections) {
      let entries: Array<{ appId: string; title: string }>;
      try {
        entries = (await gplay.list({
          collection: collection as never,
          category: category as never,
          num: PER_CATEGORY,
          country: "us",
        })) as unknown as Array<{ appId: string; title: string }>;
      } catch {
        continue; // some category/collection combos 404 — skip, never abort
      }
      await sleep(LIST_GAP_MS);

      for (const entry of entries) {
        if (existing.has(entry.appId)) continue;
        try {
          const meta = await fetchGoogleAppMetadata(entry.appId);
          const id = await upsertApp(db, {
            store: "google",
            storeAppId: meta.storeAppId,
            bundleId: meta.bundleId,
            title: meta.title,
            developer: meta.developer,
            category: meta.category,
            iconUrl: meta.iconUrl,
            description: meta.description,
            websiteUrl: meta.websiteUrl,
            contentRating: meta.contentRating,
            screenshotUrls: meta.screenshotUrls,
            releasedAt: meta.releasedAt,
            updatedAt: meta.updatedAt,
            price: meta.price,
          });
          await upsertSnapshot(db, {
            appId: id,
            snapshotDate,
            reviewCount: meta.reviewCount,
            rating: meta.rating,
            chartRank: null,
            chartCategory: null,
            chartCountry: "US",
          });
          existing.add(entry.appId);
          added++;
          if (added >= NEW_APPS_PER_RUN || total + added >= GOOGLE_TARGET_TOTAL) break outer;
        } catch {
          /* one app failing must not abort the sweep */
        }
        await sleep(METADATA_GAP_MS);
      }
    }
  }

  total = await count();
  return { totalGoogle: total, added, target: GOOGLE_TARGET_TOTAL };
}

const isMain = process.argv[1]?.includes("google-expand");
if (isMain) {
  runGoogleExpand()
    .then((r) => {
      console.log(`[google-expand] ${r.totalGoogle}/${r.target} google apps (+${r.added})`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("[google-expand] fatal:", error);
      process.exit(1);
    });
}
