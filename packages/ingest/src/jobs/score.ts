#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { createDb, enrichSnapshotScores, getLatestSnapshot } from "@kittie/db";

import { listTrackedApps } from "../db/apps.js";

/** Re-score latest snapshots without re-fetching store data. */
export async function runScore(): Promise<void> {
  loadEnv();
  const db = createDb();
  const tracked = await listTrackedApps(db);

  console.log(`Scoring ${tracked.length} apps…`);

  let scored = 0;
  for (const app of tracked) {
    const latest = await getLatestSnapshot(db, app.id);
    if (!latest) continue;
    await enrichSnapshotScores(db, app.id, latest.snapshotDate);
    scored++;
  }

  console.log(`Score complete: ${scored} snapshots updated`);
}

const isMain = process.argv[1]?.includes("score");
if (isMain) {
  runScore().catch((error) => {
    console.error("Score failed:", error);
    process.exit(1);
  });
}
