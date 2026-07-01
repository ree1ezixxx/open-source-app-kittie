import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createDb } from "../client.js";
import {
  addKeywordForTrackedApp,
  buildPositionHistorySeries,
  deleteKeywordForTrackedApp,
  filterGeneratedKeywordsForCountry,
  keywordIdsForGeneratedKeywords,
  latestRankObservations,
  listGeneratedKeywordsForTrackedApp,
  replaceGeneratedKeywordsForTrackedApp,
} from "./tracked-apps.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

async function createTrackedKeywordDb() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "kittie-tracked-apps-"));
  tempDirs.push(dir);
  const db = createDb(`file:${path.join(dir, "test.db")}`);

  await db.$client.execute(`
    CREATE TABLE apps (
      id TEXT PRIMARY KEY,
      store TEXT NOT NULL,
      store_app_id TEXT NOT NULL,
      title TEXT NOT NULL,
      developer TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL
    )
  `);
  await db.$client.execute(`
    CREATE TABLE tracked_apps (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      store TEXT NOT NULL,
      country TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      generated_keyword_count INTEGER NOT NULL DEFAULT 0,
      last_analyzed_at INTEGER
    )
  `);
  await db.$client.execute(`
    CREATE TABLE tracked_app_keywords (
      id TEXT PRIMARY KEY,
      tracked_app_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      store TEXT NOT NULL,
      country TEXT NOT NULL,
      keyword TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at INTEGER NOT NULL
    )
  `);
  await db.$client.execute(`
    INSERT INTO apps (id, store, store_app_id, title, developer, first_seen_at)
    VALUES ('app_1', 'apple', '123', 'Test App', 'Test Dev', 1719000000)
  `);
  await db.$client.execute(`
    INSERT INTO tracked_apps (id, app_id, store, country, added_at, generated_keyword_count)
    VALUES ('ta_1', 'app_1', 'apple', 'US', 1719000000, 0)
  `);

  return db;
}

describe("latestRankObservations", () => {
  it("lets a fresh not-ranked observation supersede an older positive rank", () => {
    const latest = latestRankObservations([
      { keywordId: "apple:US:learn spanish", rank: null, observedAt: new Date("2026-06-22T12:00:00Z") },
      { keywordId: "apple:US:learn spanish", rank: 5, observedAt: new Date("2026-06-21T12:00:00Z") },
    ]);

    expect(latest.get("apple:US:learn spanish")).toEqual({
      rank: null,
      observedAt: new Date("2026-06-22T12:00:00Z"),
    });
  });
});

describe("keywordIdsForGeneratedKeywords", () => {
  it("fans generated keywords into a selected market lookup id", () => {
    const ids = keywordIdsForGeneratedKeywords([
      {
        id: "tak_1",
        trackedAppId: "ta_1",
        appId: "app_1",
        store: "apple",
        country: "US",
        keyword: "learn spanish",
        source: "ai",
        createdAt: new Date("2026-06-22T12:00:00Z"),
      },
    ], "DE");

    expect(ids).toEqual(["apple:DE:learn spanish"]);
  });
});

describe("buildPositionHistorySeries", () => {
  const generated = [{
    id: "tak_1",
    trackedAppId: "ta_1",
    appId: "app_1",
    store: "apple" as const,
    country: "US",
    keyword: "learn spanish",
    source: "ai",
    createdAt: new Date("2026-06-20T12:00:00Z"),
  }];

  it("builds per-keyword points with day-over-day deltas", () => {
    const series = buildPositionHistorySeries({
      generated,
      rankingRows: [
        { keywordId: "apple:US:learn spanish", rank: 8, observedAt: new Date("2026-06-20T12:00:00Z") },
        { keywordId: "apple:US:learn spanish", rank: 5, observedAt: new Date("2026-06-21T12:00:00Z") },
        { keywordId: "apple:US:learn spanish", rank: 7, observedAt: new Date("2026-06-22T12:00:00Z") },
      ],
      country: "US",
    });

    expect(series[0]?.points).toEqual([
      { date: "2026-06-20", position: 8, delta: null },
      { date: "2026-06-21", position: 5, delta: 3 },
      { date: "2026-06-22", position: 7, delta: -2 },
    ]);
  });

  it("collapses duplicate same-day observations before computing deltas", () => {
    const series = buildPositionHistorySeries({
      generated,
      rankingRows: [
        { keywordId: "apple:US:learn spanish", rank: 8, observedAt: new Date("2026-06-20T12:00:00Z") },
        { keywordId: "apple:US:learn spanish", rank: 4, observedAt: new Date("2026-06-21T09:00:00Z") },
        { keywordId: "apple:US:learn spanish", rank: 5, observedAt: new Date("2026-06-21T16:00:00Z") },
        { keywordId: "apple:US:learn spanish", rank: 7, observedAt: new Date("2026-06-22T12:00:00Z") },
      ],
      country: "US",
    });

    expect(series[0]?.points).toEqual([
      { date: "2026-06-20", position: 8, delta: null },
      { date: "2026-06-21", position: 5, delta: 3 },
      { date: "2026-06-22", position: 7, delta: -2 },
    ]);
  });

  it("keeps one-day data honest with no fabricated delta", () => {
    const series = buildPositionHistorySeries({
      generated,
      rankingRows: [
        { keywordId: "apple:US:learn spanish", rank: 5, observedAt: new Date("2026-06-22T12:00:00Z") },
      ],
      country: "US",
    });

    expect(series[0]?.points).toEqual([
      { date: "2026-06-22", position: 5, delta: null },
    ]);
  });
});

describe("tracked app keyword market scope", () => {
  it("stores the same keyword independently per market and deletes only the selected market", async () => {
    const db = await createTrackedKeywordDb();

    await addKeywordForTrackedApp(db, {
      trackedAppId: "ta_1",
      appId: "app_1",
      store: "apple",
      country: "US",
      keyword: "budget planner",
      inputHash: "custom:US",
      source: "custom",
    });
    await addKeywordForTrackedApp(db, {
      trackedAppId: "ta_1",
      appId: "app_1",
      store: "apple",
      country: "GB",
      keyword: "budget planner",
      inputHash: "custom:GB",
      source: "custom",
    });

    let rows = await listGeneratedKeywordsForTrackedApp(db, "ta_1");
    expect(rows.map((row) => `${row.country}:${row.keyword}`)).toEqual([
      "US:budget planner",
      "GB:budget planner",
    ]);

    await deleteKeywordForTrackedApp(db, "ta_1", "US", "budget planner");
    rows = await listGeneratedKeywordsForTrackedApp(db, "ta_1");
    expect(rows.map((row) => `${row.country}:${row.keyword}`)).toEqual([
      "GB:budget planner",
    ]);
  });

  it("shows ai keywords globally but custom keywords only in their selected market", () => {
    const filtered = filterGeneratedKeywordsForCountry([
      {
        id: "tak_ai",
        trackedAppId: "ta_1",
        appId: "app_1",
        store: "apple",
        country: "US",
        keyword: "habit tracker",
        source: "ai",
        createdAt: new Date("2026-06-22T12:00:00Z"),
      },
      {
        id: "tak_gb",
        trackedAppId: "ta_1",
        appId: "app_1",
        store: "apple",
        country: "GB",
        keyword: "goal planner",
        source: "custom",
        createdAt: new Date("2026-06-22T12:00:00Z"),
      },
    ], "US");

    expect(filtered.map((row) => `${row.source}:${row.country}:${row.keyword}`)).toEqual([
      "ai:US:habit tracker",
    ]);
  });
});

describe("replaceGeneratedKeywordsForTrackedApp", () => {
  it("replaces AI keywords without deleting custom market keywords", async () => {
    const db = await createTrackedKeywordDb();
    await addKeywordForTrackedApp(db, {
      trackedAppId: "ta_1",
      appId: "app_1",
      store: "apple",
      country: "GB",
      keyword: "custom phrase",
      inputHash: "custom:GB",
      source: "custom",
    });
    await replaceGeneratedKeywordsForTrackedApp(db, {
      trackedAppId: "ta_1",
      appId: "app_1",
      store: "apple",
      country: "US",
      inputHash: "hash:v2",
      keywords: ["ai keyword one", "ai keyword two"],
    });

    const rows = await listGeneratedKeywordsForTrackedApp(db, "ta_1");
    expect(rows.map((row) => `${row.source}:${row.country}:${row.keyword}`).sort()).toEqual([
      "ai:US:ai keyword one",
      "ai:US:ai keyword two",
      "custom:GB:custom phrase",
    ]);
  });
});

describe("deleteKeywordForTrackedApp", () => {
  it("deletes AI keywords by stored country even when caller passes another market", async () => {
    const db = await createTrackedKeywordDb();
    await replaceGeneratedKeywordsForTrackedApp(db, {
      trackedAppId: "ta_1",
      appId: "app_1",
      store: "apple",
      country: "US",
      inputHash: "hash:v1",
      keywords: ["habit tracker"],
    });

    await deleteKeywordForTrackedApp(db, "ta_1", "US", "habit tracker");
    const rows = await listGeneratedKeywordsForTrackedApp(db, "ta_1");
    expect(rows).toEqual([]);
  });
});
