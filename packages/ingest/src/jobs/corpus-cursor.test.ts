import { describe, expect, it } from "vitest";

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

const STARTED_AT = "2026-06-10T00:00:00.000Z";

function snapshot(cursor: CorpusCursor): CorpusCursor {
  return structuredClone(cursor);
}

describe("createCursor", () => {
  it("crosses every seed with every market onto the expand queue", () => {
    const cursor = createCursor("apple", ["meditation", "habit tracker"], ["US", "GB"], STARTED_AT);

    expect(cursor.phase).toBe("expanding");
    expect(cursor.queue).toEqual([]);
    expect(cursor.doneKeys).toEqual([]);
    expect(cursor.failures).toEqual({});
    expect(cursor.startedAt).toBe(STARTED_AT);
    expect(cursor.expandQueue).toEqual([
      { seed: "meditation", country: "US" },
      { seed: "meditation", country: "GB" },
      { seed: "habit tracker", country: "US" },
      { seed: "habit tracker", country: "GB" },
    ]);
  });

  it("normalizes markets to uppercase and drops duplicate/empty seeds", () => {
    const cursor = createCursor("google", ["sleep", "Sleep", " ", "focus"], ["us", "US", "de"], STARTED_AT);

    expect(cursor.seeds).toEqual(["sleep", "focus"]);
    expect(cursor.markets).toEqual(["US", "DE"]);
    expect(cursor.expandQueue).toHaveLength(4);
  });
});

describe("itemKey", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(itemKey({ keyword: " Habit Tracker ", country: "us" })).toBe("US:habit tracker");
    expect(itemKey({ keyword: "habit tracker", country: "US" })).toBe("US:habit tracker");
  });
});

describe("enqueueKeywords", () => {
  it("dedups against the queue, doneKeys, and within the batch", () => {
    let cursor = createCursor("apple", ["sleep"], ["US"], STARTED_AT);
    cursor = enqueueKeywords(cursor, ["sleep tracker", "sleep sounds", "Sleep Tracker"], "US");
    expect(cursor.queue.map((i) => i.keyword)).toEqual(["sleep tracker", "sleep sounds"]);

    cursor = markDone(cursor, { keyword: "sleep sounds", country: "US" });
    cursor = enqueueKeywords(cursor, ["sleep sounds", "sleep tracker", "white noise"], "US");
    expect(cursor.queue.map((i) => i.keyword)).toEqual(["sleep tracker", "white noise"]);
  });

  it("keeps the same keyword in different markets as distinct items", () => {
    let cursor = createCursor("apple", ["sleep"], ["US", "GB"], STARTED_AT);
    cursor = enqueueKeywords(cursor, ["sleep tracker"], "US");
    cursor = enqueueKeywords(cursor, ["sleep tracker"], "GB");
    expect(cursor.queue).toHaveLength(2);
    expect(cursor.queue.map(itemKey)).toEqual(["US:sleep tracker", "GB:sleep tracker"]);
  });
});

describe("serialization round-trip", () => {
  it("resumes from a serialized mid-queue state", () => {
    let cursor = createCursor("apple", ["sleep"], ["US"], STARTED_AT);
    cursor = enqueueKeywords(cursor, ["sleep tracker", "sleep sounds", "white noise"], "US");
    cursor = { ...cursor, phase: "scoring", expandQueue: [] };
    cursor = markDone(cursor, { keyword: "sleep tracker", country: "US" });
    cursor = markFailed(cursor, { keyword: "sleep sounds", country: "US" });

    const revived = deserializeCursor(serializeCursor(cursor));
    expect(revived).toEqual(cursor);

    const [next] = nextItems(revived, 1);
    expect(next).toEqual({ keyword: "sleep sounds", country: "US" });
    expect(revived.failures["US:sleep sounds"]).toBe(1);
    expect(revived.doneKeys).toContain("US:sleep tracker");
  });

  it("throws on garbage input", () => {
    expect(() => deserializeCursor("not json at all")).toThrow(/JSON/);
    expect(() => deserializeCursor("null")).toThrow();
    expect(() => deserializeCursor("{}")).toThrow();
    expect(() => deserializeCursor(JSON.stringify({ store: "amazon" }))).toThrow(/store/);

    const valid = createCursor("apple", ["sleep"], ["US"], STARTED_AT);
    const wrongQueue = { ...valid, queue: [{ keyword: 42, country: "US" }] };
    expect(() => deserializeCursor(JSON.stringify(wrongQueue))).toThrow(/queue/);
    const wrongFailures = { ...valid, failures: { "US:x": "three" } };
    expect(() => deserializeCursor(JSON.stringify(wrongFailures))).toThrow(/failures/);
  });
});

describe("three-strike retirement", () => {
  const item: CorpusItem = { keyword: "sleep tracker", country: "US" };

  it("keeps a failing item queued until the third strike, then retires it", () => {
    let cursor = createCursor("apple", ["sleep"], ["US"], STARTED_AT);
    cursor = enqueueKeywords(cursor, ["sleep tracker"], "US");

    cursor = markFailed(cursor, item);
    expect(cursor.queue).toHaveLength(1);
    expect(cursor.failures[itemKey(item)]).toBe(1);

    cursor = markFailed(cursor, item);
    expect(cursor.queue).toHaveLength(1);
    expect(cursor.failures[itemKey(item)]).toBe(2);

    cursor = markFailed(cursor, item);
    expect(cursor.queue).toHaveLength(0);
    expect(cursor.doneKeys).toContain(itemKey(item));
    expect(cursor.failures[itemKey(item)]).toBe(3);
  });

  it("never re-enqueues a retired item", () => {
    let cursor = createCursor("apple", ["sleep"], ["US"], STARTED_AT);
    cursor = enqueueKeywords(cursor, ["sleep tracker"], "US");
    cursor = markFailed(cursor, item);
    cursor = markFailed(cursor, item);
    cursor = markFailed(cursor, item);

    cursor = enqueueKeywords(cursor, ["sleep tracker"], "US");
    expect(cursor.queue).toHaveLength(0);
  });
});

describe("backoffMs", () => {
  it("doubles per attempt and caps at 60s", () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(5)).toBe(32000);
    expect(backoffMs(6)).toBe(60000);
    expect(backoffMs(20)).toBe(60000);
  });

  it("respects a custom base and stays deterministic", () => {
    expect(backoffMs(2, 500)).toBe(2000);
    expect(backoffMs(3, 250)).toBe(backoffMs(3, 250));
  });
});

describe("nextItems", () => {
  it("skips items with three or more failures and honors n", () => {
    let cursor = createCursor("apple", ["sleep"], ["US"], STARTED_AT);
    cursor = enqueueKeywords(cursor, ["a", "b", "c"], "US");
    cursor = { ...cursor, failures: { "US:a": 3 } };

    expect(nextItems(cursor, 1)).toEqual([{ keyword: "b", country: "US" }]);
    expect(nextItems(cursor, 5).map((i) => i.keyword)).toEqual(["b", "c"]);
    expect(nextItems(cursor, 0)).toEqual([]);
  });

  it("still returns items below the strike threshold", () => {
    let cursor = createCursor("apple", ["sleep"], ["US"], STARTED_AT);
    cursor = enqueueKeywords(cursor, ["a"], "US");
    cursor = markFailed(cursor, { keyword: "a", country: "US" });
    cursor = markFailed(cursor, { keyword: "a", country: "US" });
    expect(nextItems(cursor, 1)).toHaveLength(1);
  });
});

describe("immutability", () => {
  it("never mutates the input cursor", () => {
    const base = createCursor("apple", ["sleep"], ["US", "GB"], STARTED_AT);
    const withQueue = enqueueKeywords(base, ["sleep tracker", "white noise"], "US");
    const item: CorpusItem = { keyword: "sleep tracker", country: "US" };

    const baseBefore = snapshot(base);
    enqueueKeywords(base, ["another"], "GB");
    expect(base).toEqual(baseBefore);

    const queuedBefore = snapshot(withQueue);
    markDone(withQueue, item);
    expect(withQueue).toEqual(queuedBefore);

    markFailed(withQueue, item);
    markFailed(withQueue, item);
    markFailed(withQueue, item);
    expect(withQueue).toEqual(queuedBefore);

    nextItems(withQueue, 2);
    deserializeCursor(serializeCursor(withQueue));
    expect(withQueue).toEqual(queuedBefore);
  });
});
