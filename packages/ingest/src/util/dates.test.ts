import { describe, expect, it } from "vitest";

import { clampReleaseDate } from "./dates.js";

// Fixed reference "now" so the future/past boundary is deterministic.
const NOW = new Date("2026-06-15T00:00:00.000Z");

describe("clampReleaseDate", () => {
  it("rejects a future date (pre-order poison) → null", () => {
    expect(clampReleaseDate("2026-09-25", NOW)).toBeNull();
  });

  it("passes a recent past date through unchanged", () => {
    const result = clampReleaseDate("2026-06-10T12:00:00.000Z", NOW);
    expect(result).toEqual(new Date("2026-06-10T12:00:00.000Z"));
  });

  it("treats the exact 'now' instant as valid (not future)", () => {
    expect(clampReleaseDate(NOW.toISOString(), NOW)).toEqual(NOW);
  });

  it("returns null for undefined", () => {
    expect(clampReleaseDate(undefined, NOW)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(clampReleaseDate("", NOW)).toBeNull();
  });

  it("returns null for an unparseable string", () => {
    expect(clampReleaseDate("not-a-date", NOW)).toBeNull();
  });

  it("accepts a Date instance and rejects it when future", () => {
    expect(clampReleaseDate(new Date("2026-06-01"), NOW)).toEqual(
      new Date("2026-06-01"),
    );
    expect(clampReleaseDate(new Date("2027-01-01"), NOW)).toBeNull();
  });
});
