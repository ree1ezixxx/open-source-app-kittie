#!/usr/bin/env node
/**
 * Keyword catalog seeder — populates the `keywords` table so the ASO Keyword
 * Explorer has real data to browse (it ships empty otherwise).
 *
 * Two stages, both off free public store data (no paid ASO API):
 *  1) EXPAND — take a curated set of category head-terms and run each through
 *     `suggestRelatedKeywords` (competitor title/description mining + App Store
 *     autocomplete, brand/meme/stopword-filtered) → a deduped pool of genuine
 *     search phrases users actually type.
 *  2) SYNC — `syncKeyword` each: live store search → top ranking apps + field
 *     depth + search popularity → difficulty/traffic, persisted to `keywords`.
 *
 * Gentle + resumable: already-synced keywords just upsert. Tune via env
 * (COUNTRY, STORE, PER_SEED, TARGET, SLEEP). Idempotent.
 */
import { loadEnv } from "@kittie/core";
import { createDb } from "@kittie/db";
import type { Store } from "@kittie/types";

import { syncKeyword } from "../db/keywords.js";
import { suggestRelatedKeywords } from "../keyword-suggest.js";
import { sleep } from "../util/rate-limit.js";

// Curated category head-terms spanning the main App Store / Play genres. Each
// expands into ~PER_SEED real related phrases, so this list is a multiplier.
const SEEDS = [
  "photo editor", "video editor", "ai chat", "ai art generator", "language learning",
  "budget tracker", "expense tracker", "workout", "home workout", "meditation",
  "sleep sounds", "weather", "vpn", "password manager", "recipe", "meal planner",
  "calorie counter", "intermittent fasting", "habit tracker", "notes", "to do list",
  "pdf editor", "document scanner", "translator", "qr scanner", "wallpaper",
  "music player", "podcast", "audiobook", "dating", "video call", "live wallpaper",
  "puzzle game", "word game", "racing game", "card game", "idle game", "kids learning",
  "coloring book", "drawing", "guitar tuner", "running tracker", "cycling", "golf gps",
  "stock tracker", "crypto wallet", "invoice maker", "resume builder", "ebook reader",
  "manga reader", "comic maker", "ai photo", "face swap", "background remover",
  "screen recorder", "file manager", "calculator", "period tracker", "baby tracker",
  "plant identifier", "bird identifier", "astrology", "tarot", "white noise",
];

const COUNTRY = process.env.COUNTRY ?? "US";
const STORE = (process.env.STORE ?? "apple") as Store;
const PER_SEED = Number(process.env.PER_SEED ?? 25);
const TARGET = Number(process.env.TARGET ?? 1500);
const SLEEP = Number(process.env.SLEEP ?? 300);

export async function runKeywordSeed(): Promise<void> {
  loadEnv();
  const db = createDb();
  const startedAt = Date.now();
  console.log(`\n[keyword-seed] ${SEEDS.length} seeds · ${STORE}/${COUNTRY} · target ${TARGET}`);

  // 1) EXPAND.
  const pool = new Set<string>(SEEDS.map((s) => s.toLowerCase()));
  for (const seed of SEEDS) {
    try {
      for (const idea of await suggestRelatedKeywords(seed, COUNTRY, STORE, PER_SEED)) {
        pool.add(idea.trim().toLowerCase());
      }
    } catch (e) {
      console.warn(`  expand "${seed}" failed: ${(e as Error).message}`);
    }
    await sleep(SLEEP);
    if (pool.size >= TARGET) break;
  }
  const keywords = [...pool].slice(0, TARGET);
  console.log(`[keyword-seed] expanded ${SEEDS.length} seeds → ${keywords.length} unique keywords (${sec(startedAt)}s)\n`);

  // 2) SYNC.
  let ok = 0;
  let failed = 0;
  for (const kw of keywords) {
    try {
      await syncKeyword(db, kw, COUNTRY, STORE);
      ok++;
      if (ok % 25 === 0) {
        console.log(`  …synced ${ok}/${keywords.length} (${failed} failed, ${sec(startedAt)}s)`);
      }
    } catch (e) {
      failed++;
      if (failed % 25 === 0) console.warn(`  …${failed} failures (last: ${(e as Error).message})`);
    }
    await sleep(SLEEP);
  }

  console.log(`\n[keyword-seed] done in ${sec(startedAt)}s — ${ok} synced, ${failed} failed.\n`);
}

function sec(from: number): string {
  return ((Date.now() - from) / 1000).toFixed(0);
}

const isMain = process.argv[1]?.includes("keyword-seed");
if (isMain) {
  runKeywordSeed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[keyword-seed] fatal:", error);
      process.exit(1);
    });
}
