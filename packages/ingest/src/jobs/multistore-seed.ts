#!/usr/bin/env node
/**
 * Multi-store consolidation seed (additive lane, PRD D10).
 *
 * Pulls Steam games (paced appdetails calls — ~200 req / 5 min limit, default
 * 1500ms gap) and itch.io newest games (one RSS fetch) into the widened apps
 * table. Upserts use direct drizzle on apps — NOT db/apps.ts upsertApp, whose
 * input is typed to the mobile-only Store union ("apple" | "google").
 *
 * Usage:
 *   pnpm exec tsx src/jobs/multistore-seed.ts \
 *     [--steam N] [--itch N] [--steam-pause-ms 1500] [--dry-run]
 *
 * --dry-run prints the plan plus the first 3 mapped rows per store and
 * performs no writes (and only the handful of fetches needed for those rows).
 */
import { loadEnv } from "@kittie/core";
import { apps, createDb } from "@kittie/db";

import { fetchItchNewGames } from "../itch/metadata.js";
import { fetchSteamAppDetails, fetchSteamAppList } from "../steam/metadata.js";
import type { ItchGameMetadata } from "../itch/metadata.js";
import type { SteamAppMetadata } from "../steam/metadata.js";
import { sleep } from "../util/rate-limit.js";

type Db = ReturnType<typeof createDb>;
type AppInsert = typeof apps.$inferInsert;

interface MultistoreSeedArgs {
  steam: number;
  itch: number;
  steamPauseMs: number;
  dryRun: boolean;
}

const DRY_RUN_PREVIEW_COUNT = 3;
/** Hard cap on appdetails attempts per run: 5× the requested steam target. */
const STEAM_ATTEMPT_MULTIPLIER = 5;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function parseArgs(argv: string[]): MultistoreSeedArgs {
  let steam = 100;
  let itch = 25;
  let steamPauseMs = 1500;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--steam" && argv[i + 1]) {
      steam = parsePositiveInt(argv[++i], 100);
    } else if (arg === "--itch" && argv[i + 1]) {
      itch = parsePositiveInt(argv[++i], 25);
    } else if (arg === "--steam-pause-ms" && argv[i + 1]) {
      steamPauseMs = parsePositiveInt(argv[++i], 1500);
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { steam, itch, steamPauseMs, dryRun };
}

function steamRow(meta: SteamAppMetadata, now: Date): AppInsert {
  return {
    id: `steam:${meta.storeAppId}`,
    store: "steam",
    storeAppId: meta.storeAppId,
    bundleId: null,
    title: meta.title,
    developer: meta.developer,
    category: meta.category,
    iconUrl: meta.iconUrl,
    description: meta.description,
    websiteUrl: meta.websiteUrl,
    supportEmail: null,
    price: meta.price,
    contentRating: meta.contentRating,
    languages: null,
    screenshotUrls: JSON.stringify(meta.screenshotUrls),
    releasedAt: meta.releasedAt,
    updatedAt: null,
    firstSeenAt: now,
    lastIngestedAt: now,
  };
}

function itchRow(meta: ItchGameMetadata, now: Date): AppInsert {
  return {
    id: `itch:${meta.storeAppId}`,
    store: "itch",
    storeAppId: meta.storeAppId,
    bundleId: null,
    title: meta.title,
    developer: meta.developer,
    category: null,
    iconUrl: null,
    description: meta.description,
    websiteUrl: meta.gameUrl,
    supportEmail: null,
    price: meta.price,
    contentRating: null,
    languages: null,
    screenshotUrls: JSON.stringify(meta.screenshotUrls),
    releasedAt: meta.releasedAt,
    updatedAt: null,
    firstSeenAt: now,
    lastIngestedAt: now,
  };
}

/** firstSeenAt is set on insert only — the conflict set never touches it. */
async function upsertAppRow(db: Db, row: AppInsert): Promise<void> {
  await db
    .insert(apps)
    .values(row)
    .onConflictDoUpdate({
      target: apps.id,
      set: {
        title: row.title,
        developer: row.developer,
        category: row.category ?? null,
        iconUrl: row.iconUrl ?? null,
        description: row.description ?? null,
        websiteUrl: row.websiteUrl ?? null,
        price: row.price ?? null,
        contentRating: row.contentRating ?? null,
        screenshotUrls: row.screenshotUrls ?? null,
        releasedAt: row.releasedAt ?? null,
        lastIngestedAt: row.lastIngestedAt ?? null,
      },
    });
}

function printPreviewRow(row: AppInsert): void {
  console.log(
    `    ${row.id} — "${row.title}" by ${row.developer}` +
      ` (price=${row.price ?? "null"}, category=${row.category ?? "null"},` +
      ` released=${row.releasedAt ? row.releasedAt.toISOString().slice(0, 10) : "null"})`,
  );
}

interface SteamResult {
  ok: number;
  skipped: number;
  attempts: number;
}

async function seedSteam(
  db: Db | null,
  target: number,
  pauseMs: number,
  dryRun: boolean,
): Promise<SteamResult> {
  const result: SteamResult = { ok: 0, skipped: 0, attempts: 0 };
  if (target <= 0) return result;

  const attemptsCap = target * STEAM_ATTEMPT_MULTIPLIER;

  console.log("Fetching Steam app list…");
  const list = await fetchSteamAppList({ limit: attemptsCap * 2 });
  console.log(`  ${list.length} named entries fetched (cap ${attemptsCap * 2})`);

  const previews: AppInsert[] = [];

  for (const entry of list) {
    if (result.ok >= target || result.attempts >= attemptsCap) break;
    if (result.attempts > 0) await sleep(pauseMs);
    result.attempts++;

    let meta: SteamAppMetadata | null = null;
    try {
      meta = await fetchSteamAppDetails(entry.appid);
    } catch (error) {
      console.warn(`  ✗ appdetails failed for ${entry.appid} ("${entry.name}"):`, error);
    }

    if (meta === null) {
      result.skipped++;
      continue;
    }

    const row = steamRow(meta, new Date());
    if (dryRun) {
      previews.push(row);
      result.ok++;
    } else {
      try {
        await upsertAppRow(db!, row);
        result.ok++;
      } catch (error) {
        console.warn(`  ✗ upsert failed for ${row.id}:`, error);
        result.skipped++;
      }
    }
  }

  if (dryRun && previews.length > 0) {
    console.log(`  First ${previews.length} mapped Steam rows:`);
    for (const row of previews) printPreviewRow(row);
  }

  return result;
}

async function seedItch(
  db: Db | null,
  target: number,
  dryRun: boolean,
): Promise<number> {
  if (target <= 0) return 0;

  console.log("Fetching itch.io newest-games feed…");
  let games: ItchGameMetadata[];
  try {
    games = await fetchItchNewGames({ limit: target });
  } catch (error) {
    console.warn("  ✗ itch.io feed fetch failed — skipping itch path:", error);
    return 0;
  }
  console.log(`  ${games.length} games parsed from feed`);

  let ok = 0;
  const previews: AppInsert[] = [];

  for (const game of games) {
    const row = itchRow(game, new Date());
    if (dryRun) {
      if (previews.length < DRY_RUN_PREVIEW_COUNT) previews.push(row);
      ok++;
      continue;
    }
    try {
      await upsertAppRow(db!, row);
      ok++;
    } catch (error) {
      console.warn(`  ✗ upsert failed for ${row.id}:`, error);
    }
  }

  if (dryRun && previews.length > 0) {
    console.log(`  First ${previews.length} mapped itch rows:`);
    for (const row of previews) printPreviewRow(row);
  }

  return ok;
}

export async function runMultistoreSeed(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseArgs(argv);

  console.log(
    `Multistore seed plan: steam=${args.steam} itch=${args.itch}` +
      ` steam-pause-ms=${args.steamPauseMs}${args.dryRun ? " [DRY RUN — no writes]" : ""}`,
  );

  const db = args.dryRun ? null : createDb();

  // Dry run stays polite: fetch only enough to show the preview rows.
  const steamTarget = args.dryRun
    ? Math.min(DRY_RUN_PREVIEW_COUNT, args.steam)
    : args.steam;
  const itchTarget = args.dryRun
    ? Math.min(DRY_RUN_PREVIEW_COUNT, args.itch)
    : args.itch;

  const steam = await seedSteam(db, steamTarget, args.steamPauseMs, args.dryRun);
  const itchOk = await seedItch(db, itchTarget, args.dryRun);

  const verb = args.dryRun ? "mapped (dry run, no writes)" : "upserted";
  console.log(
    `\nMultistore seed complete: steam ${steam.ok} ${verb}, ${steam.skipped} skipped` +
      ` (${steam.attempts} attempts); itch ${itchOk} ${verb}`,
  );
}

const isMain = process.argv[1]?.includes("multistore-seed");
if (isMain) {
  runMultistoreSeed().catch((error) => {
    console.error("Multistore seed failed:", error);
    process.exit(1);
  });
}
