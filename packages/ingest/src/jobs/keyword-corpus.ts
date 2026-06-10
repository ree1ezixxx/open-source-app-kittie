#!/usr/bin/env node
import { loadEnv } from "@kittie/core";
import { apps, createDb, jobCursors, keywordRankings, type Db } from "@kittie/db";
import type { Store } from "@kittie/types";
import { eq, inArray, isNotNull } from "drizzle-orm";

import { searchAppleKeyword } from "../apple/search.js";
import { syncKeyword } from "../db/keywords.js";
import { searchGoogleKeyword } from "../google/search.js";
import { suggestRelatedKeywords } from "../keyword-suggest.js";
import { makeAppId, makeKeywordId } from "../util/ids.js";
import { sleep } from "../util/rate-limit.js";
import {
  backoffMs,
  createCursor,
  deserializeCursor,
  enqueueKeywords,
  itemKey,
  markDone,
  markFailed,
  nextItems,
  serializeCursor,
  type CorpusCursor,
  type CorpusItem,
} from "./corpus-cursor.js";

/**
 * Keyword corpus sweep — grows the Keyword table at scale, multi-market, $0.
 * Seeds expand via the competitor-listing phrase miner, each (keyword, market)
 * is scored through syncKeyword, and the top-10 ranking Apps are exploded into
 * the keyword_rankings inverse index. The cursor persists to job_cursors after
 * every item, so a crash or Ctrl-C resumes exactly where it stopped.
 */

const TOP_RANKS = 10;
const EXPAND_LIMIT = 20;
/** Consecutive failures before an expand seed is dropped rather than retried. */
const EXPAND_STRIKES = 3;

interface CorpusArgs {
  store: Store;
  markets: string[];
  seeds: string[];
  seedsFromCategories: boolean;
  limit: number;
  batchPauseMs: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CorpusArgs {
  let store: Store = "apple";
  let markets = ["US"];
  let seeds: string[] = [];
  let seedsFromCategories = false;
  let limit = 0;
  let batchPauseMs = 300;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--store" && argv[i + 1]) {
      store = argv[++i]! as Store;
    } else if (arg === "--markets" && argv[i + 1]) {
      markets = argv[++i]!.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean);
    } else if (arg === "--seeds" && argv[i + 1]) {
      seeds = argv[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--seeds-from-categories") {
      seedsFromCategories = true;
    } else if (arg === "--limit" && argv[i + 1]) {
      limit = Number(argv[++i]!) || 0;
    } else if (arg === "--batch-pause-ms" && argv[i + 1]) {
      batchPauseMs = Number(argv[++i]!) || 300;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { store, markets, seeds, seedsFromCategories, limit, batchPauseMs, dryRun };
}

/** Seed terms from the catalog itself: every distinct App category, lowercased. */
async function seedsFromAppCategories(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: apps.category })
    .from(apps)
    .where(isNotNull(apps.category));

  const out = new Set<string>();
  for (const row of rows) {
    const category = row.category?.trim().toLowerCase();
    if (category) out.add(category);
  }
  return [...out];
}

async function loadCursorState(db: Db, cursorId: string): Promise<CorpusCursor | null> {
  const rows = await db.select().from(jobCursors).where(eq(jobCursors.id, cursorId)).limit(1);
  const row = rows[0];
  return row ? deserializeCursor(row.state) : null;
}

/** Saved after EVERY item — cheap, and what makes the sweep crash-safe. */
async function saveCursor(db: Db, cursorId: string, cursor: CorpusCursor): Promise<void> {
  const state = serializeCursor(cursor);
  const updatedAt = new Date();
  await db
    .insert(jobCursors)
    .values({ id: cursorId, state, updatedAt })
    .onConflictDoUpdate({ target: jobCursors.id, set: { state, updatedAt } });
}

/** Store rate-limit / block responses deserve a harder backoff than flakes. */
function isThrottleError(error: unknown): boolean {
  return /\b(429|403)\b/.test(String(error));
}

/**
 * Explode a scored Keyword's top-10 into the keyword_rankings inverse index.
 * Only Apps already in the catalog get rows — one batched existence query, and
 * never a fabricated App row. Replace-then-insert keeps one observation set
 * per Keyword.
 */
async function writeInverseIndex(db: Db, item: CorpusItem, store: Store): Promise<number> {
  const results =
    store === "apple"
      ? await searchAppleKeyword(item.keyword, item.country, TOP_RANKS)
      : await searchGoogleKeyword(item.keyword, item.country, TOP_RANKS);

  const keywordId = makeKeywordId(store, item.country, item.keyword);
  const candidateIds = results.map((r) => makeAppId(store, r.storeAppId));

  const existing = candidateIds.length
    ? await db.select({ id: apps.id }).from(apps).where(inArray(apps.id, candidateIds))
    : [];
  const known = new Set(existing.map((r) => r.id));

  const observedAt = new Date();
  const rows = results
    .map((r) => ({ appId: makeAppId(store, r.storeAppId), rank: r.rank }))
    .filter((r) => known.has(r.appId))
    .map((r) => ({
      id: `${keywordId}:${r.appId}`,
      keywordId,
      appId: r.appId,
      rank: r.rank,
      observedAt,
    }));

  await db.delete(keywordRankings).where(eq(keywordRankings.keywordId, keywordId));
  if (rows.length > 0) await db.insert(keywordRankings).values(rows);
  return rows.length;
}

function printPlan(cursor: CorpusCursor, args: CorpusArgs, resumed: boolean): void {
  console.log(`[corpus] dry run — no writes`);
  console.log(`  cursor:   keyword-corpus:${cursor.store} (${resumed ? "resuming" : "new"})`);
  console.log(`  phase:    ${cursor.phase}`);
  console.log(`  seeds:    ${cursor.seeds.length} (${cursor.seeds.slice(0, 8).join(", ")}${cursor.seeds.length > 8 ? ", …" : ""})`);
  console.log(`  markets:  ${cursor.markets.join(", ")}`);
  console.log(`  expand:   ${cursor.expandQueue.length} seed×market pairs pending`);
  console.log(`  queue:    ${cursor.queue.length} keywords pending, ${cursor.doneKeys.length} done`);
  console.log(`  limit:    ${args.limit || "unlimited"}, pause ${args.batchPauseMs}ms`);
}

export async function runKeywordCorpus(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const db = createDb();
  const args = parseArgs(argv);
  const cursorId = `keyword-corpus:${args.store}`;

  let seeds = args.seeds;
  if (args.seedsFromCategories) {
    const derived = await seedsFromAppCategories(db);
    console.log(`[corpus] derived ${derived.length} seeds from app categories`);
    seeds = [...new Set([...seeds, ...derived])];
  }

  const existing = await loadCursorState(db, cursorId);
  let cursor: CorpusCursor;
  let resumed: boolean;
  if (existing) {
    cursor = existing;
    resumed = true;
    console.log(
      `[corpus] resuming ${cursorId}: phase=${cursor.phase} expand=${cursor.expandQueue.length} ` +
        `queue=${cursor.queue.length} done=${cursor.doneKeys.length}`,
    );
  } else {
    if (seeds.length === 0) {
      console.error(
        "Usage: tsx src/jobs/keyword-corpus.ts --seeds \"a,b,c\" [--seeds-from-categories]\n" +
          "       [--store apple|google] [--markets US,GB,DE] [--limit N] [--batch-pause-ms 300] [--dry-run]",
      );
      process.exit(1);
    }
    cursor = createCursor(args.store, seeds, args.markets, new Date().toISOString());
    resumed = false;
    console.log(
      `[corpus] new sweep ${cursorId}: ${cursor.seeds.length} seeds × ${cursor.markets.length} markets ` +
        `= ${cursor.expandQueue.length} expansions`,
    );
  }

  if (args.dryRun) {
    printPlan(cursor, args, resumed);
    return;
  }

  if (!resumed) await saveCursor(db, cursorId, cursor);

  // Phase 1 — expanding: each seed×market mines the competitor field for
  // related Keywords; the seed itself joins the scoring queue alongside them.
  let expandStrikes = 0;
  while (cursor.phase === "expanding") {
    const entry = cursor.expandQueue[0];
    if (!entry) {
      cursor = { ...cursor, phase: "scoring" };
      await saveCursor(db, cursorId, cursor);
      console.log(`[corpus] expansion complete — ${cursor.queue.length} keywords queued for scoring`);
      break;
    }
    try {
      const related = await suggestRelatedKeywords(entry.seed, entry.country, args.store, EXPAND_LIMIT);
      cursor = enqueueKeywords(cursor, [entry.seed, ...related], entry.country);
      cursor = { ...cursor, expandQueue: cursor.expandQueue.slice(1) };
      expandStrikes = 0;
      await saveCursor(db, cursorId, cursor);
      console.log(
        `  + expanded "${entry.seed}" (${entry.country}) → queue ${cursor.queue.length} ` +
          `(${cursor.expandQueue.length} expansions left)`,
      );
      await sleep(args.batchPauseMs);
    } catch (error) {
      expandStrikes++;
      const attempt = isThrottleError(error) ? expandStrikes + 2 : expandStrikes;
      console.warn(`  ✗ expand "${entry.seed}" (${entry.country}) attempt ${expandStrikes}:`, error);
      if (expandStrikes >= EXPAND_STRIKES) {
        cursor = { ...cursor, expandQueue: cursor.expandQueue.slice(1) };
        expandStrikes = 0;
        await saveCursor(db, cursorId, cursor);
      }
      await sleep(backoffMs(attempt));
    }
  }

  // Phase 2 — scoring: one Keyword at a time through syncKeyword, then the
  // top-10 explosion into keyword_rankings. Failures strike out at three.
  let processed = 0;
  while (cursor.phase === "scoring") {
    if (args.limit > 0 && processed >= args.limit) {
      console.log(`[corpus] hit --limit ${args.limit}, stopping this run`);
      break;
    }
    const [item] = nextItems(cursor, 1);
    if (!item) {
      cursor = { ...cursor, phase: "done" };
      await saveCursor(db, cursorId, cursor);
      console.log(`[corpus] queue drained — sweep done`);
      break;
    }
    try {
      const scored = await syncKeyword(db, item.keyword, item.country, args.store);
      const ranked = await writeInverseIndex(db, item, args.store);
      cursor = markDone(cursor, item);
      processed++;
      await saveCursor(db, cursorId, cursor);
      console.log(
        `  ✓ "${item.keyword}" (${item.country}) — difficulty ${scored.difficulty}, ` +
          `traffic ${scored.trafficScore}, ${ranked} ranked apps indexed [${processed}${args.limit ? `/${args.limit}` : ""}]`,
      );
      await sleep(args.batchPauseMs);
    } catch (error) {
      cursor = markFailed(cursor, item);
      await saveCursor(db, cursorId, cursor);
      const strikes = cursor.failures[itemKey(item)] ?? 1;
      const attempt = isThrottleError(error) ? strikes + 2 : strikes;
      console.warn(`  ✗ "${item.keyword}" (${item.country}) strike ${strikes}:`, error);
      await sleep(backoffMs(attempt));
    }
  }

  const remaining = nextItems(cursor, cursor.queue.length).length;
  const retired = Object.values(cursor.failures).filter((n) => n >= 3).length;
  console.log(
    `\n[corpus] run summary: processed=${processed} remaining=${remaining} failures=${retired} ` +
      `(phase=${cursor.phase}, done=${cursor.doneKeys.length})`,
  );
}

const isMain = process.argv[1]?.includes("keyword-corpus");
if (isMain) {
  runKeywordCorpus()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Keyword corpus sweep failed:", error);
      process.exit(1);
    });
}
