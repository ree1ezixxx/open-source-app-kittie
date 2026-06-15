import { describe, expect, it } from "vitest";

import { clampStoreDate } from "./dates.js";

// Fixed reference "now" so the future/past boundary is deterministic.
const NOW = new Date("2026-06-15T02:00:00.000Z");

describe("clampStoreDate", () => {
  it("rejects a genuinely future date (pre-order poison) → null", () => {
    expect(clampStoreDate("2026-09-25", NOW)).toBeNull();
  });

  it("passes a recent past date through unchanged", () => {
    const result = clampStoreDate("2026-06-10T12:00:00.000Z", NOW);
    expect(result).toEqual(new Date("2026-06-10T12:00:00.000Z"));
  });

  it("keeps a same-day instant released later than 'now' (grace window)", () => {
    // App released today at 20:00Z, sweep running at 02:00Z — must not drop it.
    const result = clampStoreDate("2026-06-15T20:00:00.000Z", NOW);
    expect(result).toEqual(new Date("2026-06-15T20:00:00.000Z"));
  });

  it("still rejects a date beyond the grace window", () => {
    // 3+ days ahead is a real pre-order, not timezone skew.
    expect(clampStoreDate("2026-06-19T00:00:00.000Z", NOW)).toBeNull();
  });

  it("accepts a Unix-ms number (Google's updated field)", () => {
    const ms = new Date("2026-06-01T00:00:00.000Z").getTime();
    expect(clampStoreDate(ms, NOW)).toEqual(new Date(ms));
  });

  it("returns null for undefined", () => {
    expect(clampStoreDate(undefined, NOW)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(clampStoreDate("", NOW)).toBeNull();
  });

  it("returns null for an unparseable string", () => {
    expect(clampStoreDate("not-a-date", NOW)).toBeNull();
  });

  it("accepts a Date instance and rejects it when far future", () => {
    expect(clampStoreDate(new Date("2026-06-01"), NOW)).toEqual(
      new Date("2026-06-01"),
    );
    expect(clampStoreDate(new Date("2027-01-01"), NOW)).toBeNull();
  });
});
