#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb } from "@kittie/db";
import type { Db } from "@kittie/db";

import { pickAppsForOrganic, upsertOrganicVideos } from "../db/organic.js";
import { stubOrganicSource, type OrganicSource } from "../organic/source.js";

export interface OrganicSyncOptions {
  /** How many Apps to attach videos to. */
  limit?: number;
  /** The feed to pull from — defaults to the stub. The one swappable seam. */
  source?: OrganicSource;
}

export interface OrganicSyncResult {
  apps: number;
  videos: number;
}

/**
 * Refresh organic creator videos for a batch of Apps. Idempotent: re-running
 * upserts the same deterministic rows and moves `lastSeenAt`, so the Organic
 * surface reflects "now" every time it runs — by the scheduled job or by the
 * page's Refresh button (which calls this in-process). The only thing standing
 * between representative and real data is swapping `opts.source`.
 */
export async function syncOrganic(
  db: Db,
  opts: OrganicSyncOptions = {},
): Promise<OrganicSyncResult> {
  const limit = opts.limit ?? 20;
  const source = opts.source ?? stubOrganicSource;

  const targetApps = await pickAppsForOrganic(db, limit);
  const videos = await source.fetchForApps(targetApps);
  const now = new Date();
  const count = await upsertOrganicVideos(db, videos, now);

  return { apps: targetApps.length, videos: count };
}

/** CLI entry: `pnpm ingest:organic` (ORGANIC_LIMIT overrides the App count). */
export async function runOrganic(): Promise<void> {
  loadEnv();
  const db = createDb();
  const limit = Number(process.env.ORGANIC_LIMIT ?? 20);
  console.log(`Organic sync: ${limit} apps via "${stubOrganicSource.name}" source…`);
  const res = await syncOrganic(db, { limit });
  console.log(`Organic sync complete: ${res.videos} videos across ${res.apps} apps`);
}

const isMain = process.argv[1]?.includes("organic");
if (isMain) {
  runOrganic().catch((error) => {
    console.error("Organic sync failed:", error);
    process.exit(1);
  });
}
