import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateLock, isLockStale } from "./lock.js";
import { BuildContextManager } from "./manager.js";
import type { MarketLock } from "./types.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-23T00:00:00.000Z");

function baseLock(snapshotDate: string): MarketLock {
  return {
    schemaVersion: 1,
    snapshotDate,
    competitorIds: [],
    dataSourceVersions: { "apple:rss": "2" },
    scoringModelVersion: "growth@4",
    coverage: "ok",
    toolVersions: { ingest: "1.2.0" },
    lockedAt: "2026-06-22T00:00:00.000Z",
  };
}

describe("market lock", () => {
  let root: string;
  let mgr: BuildContextManager;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kittie-bc-"));
    mgr = new BuildContextManager({
      projectDir: join(root, "project"),
      globalDir: join(root, "global"),
      clock: () => NOW,
      idGen: () => "id",
    });
    mgr.create();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("pins all keys and reads back identically", () => {
    const written = mgr.writeMarketLock({
      snapshotDate: "2026-06-20",
      competitorIds: ["apple:123", "google:abc"],
      dataSourceVersions: { "apple:rss": "2", "model:revenue": "3" },
      scoringModelVersion: "growth@4",
      coverage: "ok",
      toolVersions: { ingest: "1.2.0" },
    });

    const read = mgr.readMarketLock();
    expect(read).toEqual(written);
    expect(read?.competitorIds).toEqual(["apple:123", "google:abc"]);
    expect(read?.dataSourceVersions["apple:rss"]).toBe("2");
    expect(read?.scoringModelVersion).toBe("growth@4");
    expect(read?.toolVersions.ingest).toBe("1.2.0");
    expect(typeof read?.lockedAt).toBe("string");
  });

  it("detects a missing or old lock as stale", () => {
    expect(evaluateLock(null, { now: NOW, maxAgeMs: 7 * DAY })).toBe("missing");
    expect(isLockStale(null, { now: NOW, maxAgeMs: 7 * DAY })).toBe(true);

    const old = baseLock("2026-05-01");
    expect(evaluateLock(old, { now: NOW, maxAgeMs: 7 * DAY })).toBe("stale");
    expect(isLockStale(old, { now: NOW, maxAgeMs: 7 * DAY })).toBe(true);

    const fresh = baseLock("2026-06-22");
    expect(evaluateLock(fresh, { now: NOW, maxAgeMs: 7 * DAY })).toBe("fresh");
    expect(isLockStale(fresh, { now: NOW, maxAgeMs: 7 * DAY })).toBe(false);
  });

  it("flags version drift as stale even when fresh", () => {
    const lock = baseLock("2026-06-22");
    expect(
      evaluateLock(lock, {
        now: NOW,
        maxAgeMs: 7 * DAY,
        currentScoringModelVersion: "growth@5",
      }),
    ).toBe("stale");
  });
});
