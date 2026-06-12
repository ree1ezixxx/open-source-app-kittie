import { describe, it, expect } from "vitest";
import { isDataFresh, formatDataSource } from "../keywords";

describe("Data freshness helpers", () => {
  describe("isDataFresh", () => {
    it("returns false for missing computedAt", () => {
      expect(isDataFresh()).toBe(false);
      expect(isDataFresh(undefined)).toBe(false);
    });

    it("returns true for recent data (< 1 hour)", () => {
      const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 mins ago
      expect(isDataFresh(recent)).toBe(true);
    });

    it("returns false for old data (> 1 hour)", () => {
      const old = new Date(Date.now() - 90 * 60 * 1000).toISOString(); // 90 mins ago
      expect(isDataFresh(old)).toBe(false);
    });

    it("returns true for data from exactly 1 hour ago (boundary)", () => {
      const boundary = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      // Should be false since it's >= 1 hour
      expect(isDataFresh(boundary)).toBe(false);
    });

    it("returns true for data from just under 1 hour ago", () => {
      const fresh = new Date(Date.now() - (60 * 60 * 1000 - 1000)).toISOString();
      expect(isDataFresh(fresh)).toBe(true);
    });
  });

  describe("formatDataSource", () => {
    it("returns 'store search' for missing computedAt", () => {
      expect(formatDataSource()).toBe("store search");
      expect(formatDataSource(undefined)).toBe("store search");
    });

    it("returns 'live store search' for recent data", () => {
      const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      expect(formatDataSource(recent)).toBe("live store search");
    });

    it("returns 'cached store search' for old data", () => {
      const old = new Date(Date.now() - 90 * 60 * 1000).toISOString();
      expect(formatDataSource(old)).toBe("cached store search");
    });
  });
});
