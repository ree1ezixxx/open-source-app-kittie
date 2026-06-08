#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { apps, createDb } from "@kittie/db";
import type { Store } from "@kittie/types";

import { syncKeyword } from "../db/keywords.js";
import { sleep } from "../util/rate-limit.js";

function parseArgs(argv: string[]): {
  keywords: string[];
  country: string;
  store: Store;
  fromTitles: boolean;
} {
  const keywords: string[] = [];
  let country = "US";
  let store: Store = "apple";
  let fromTitles = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--country" && argv[i + 1]) {
      country = argv[++i]!;
    } else if (arg === "--store" && argv[i + 1]) {
      store = argv[++i]! as Store;
    } else if (arg === "--from-titles") {
      fromTitles = true;
    } else if (!arg.startsWith("-")) {
      keywords.push(arg);
    }
  }

  return { keywords, country, store, fromTitles };
}

async function keywordsFromAppTitles(db: ReturnType<typeof createDb>): Promise<string[]> {
  const rows = await db.select({ title: apps.title }).from(apps);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const row of rows) {
    const title = row.title.trim();
    if (title.length < 3) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }

  return out;
}

export async function runKeywordSync(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const db = createDb();
  const { keywords, country, store, fromTitles } = parseArgs(argv);

  let targets = keywords;
  if (fromTitles) {
    targets = await keywordsFromAppTitles(db);
    console.log(`Derived ${targets.length} keywords from app titles`);
  }

  if (targets.length === 0) {
    console.error(
      "Usage: pnpm ingest:keywords <keyword> [more...] [--country US] [--store apple|google]\n" +
        "       pnpm ingest:keywords --from-titles [--country US] [--store apple|google]",
    );
    process.exit(1);
  }

  console.log(`Syncing ${targets.length} keyword(s) for ${store}/${country}…`);

  let ok = 0;
  let failed = 0;

  for (const keyword of targets) {
    try {
      const result = await syncKeyword(db, keyword, country, store);
      console.log(
        `  ✓ "${keyword}" — difficulty ${result.difficulty}, traffic ${result.trafficScore}`,
      );
      ok++;
    } catch (error) {
      console.warn(`  ✗ "${keyword}":`, error);
      failed++;
    }
    await sleep(250);
  }

  console.log(`\nKeyword sync complete: ${ok} synced, ${failed} failed`);
}

const isMain = process.argv[1]?.includes("keyword-sync");
if (isMain) {
  runKeywordSync().catch((error) => {
    console.error("Keyword sync failed:", error);
    process.exit(1);
  });
}
