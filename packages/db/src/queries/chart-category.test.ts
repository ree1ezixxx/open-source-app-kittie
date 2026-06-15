import { describe, expect, it } from "vitest";
import type { ChartType } from "@kittie/types";

import {
  decodeChartCategory,
  encodeChartCategory,
  normalizeChartType,
  type ChartCategory,
} from "./chart-category.js";

describe("encodeChartCategory", () => {
  it("encodes the overall (no-genre) chart as the bare slug", () => {
    expect(encodeChartCategory({ type: "free", genre: null })).toBe("top-free");
    expect(encodeChartCategory({ type: "paid", genre: null })).toBe("top-paid");
    expect(encodeChartCategory({ type: "grossing", genre: null })).toBe("top-grossing");
  });

  it("encodes a per-genre chart as slug:genre", () => {
    expect(encodeChartCategory({ type: "paid", genre: "Business" })).toBe("top-paid:Business");
    expect(encodeChartCategory({ type: "grossing", genre: "Games" })).toBe("top-grossing:Games");
  });
});

describe("decodeChartCategory", () => {
  it("decodes known overall strings", () => {
    expect(decodeChartCategory("top-free")).toEqual({ type: "free", genre: null });
    expect(decodeChartCategory("top-paid")).toEqual({ type: "paid", genre: null });
    expect(decodeChartCategory("top-grossing")).toEqual({ type: "grossing", genre: null });
  });

  it("decodes per-genre strings, splitting on the first colon", () => {
    expect(decodeChartCategory("top-paid:Business")).toEqual({ type: "paid", genre: "Business" });
    expect(decodeChartCategory("top-grossing:Games")).toEqual({ type: "grossing", genre: "Games" });
  });

  it("preserves a genre that itself contains separators", () => {
    expect(decodeChartCategory("top-free:Food & Drink")).toEqual({
      type: "free",
      genre: "Food & Drink",
    });
  });

  it("decodes legacy raw feed ids to the type with a null genre", () => {
    expect(decodeChartCategory("topfreeapplications")).toEqual({ type: "free", genre: null });
    expect(decodeChartCategory("topgrossingapplications")).toEqual({
      type: "grossing",
      genre: null,
    });
  });

  it("returns null for unknown or empty encodings", () => {
    expect(decodeChartCategory(null)).toBeNull();
    expect(decodeChartCategory("")).toBeNull();
    expect(decodeChartCategory("top-something")).toBeNull();
  });
});

describe("round-trip encode/decode", () => {
  const cases: ChartCategory[] = [
    { type: "free", genre: null },
    { type: "paid", genre: null },
    { type: "grossing", genre: null },
    { type: "free", genre: "Business" },
    { type: "paid", genre: "Games" },
    { type: "grossing", genre: "Photo & Video" },
  ];

  it.each(cases)("decode(encode($type, $genre)) is identity", (category) => {
    expect(decodeChartCategory(encodeChartCategory(category))).toEqual(category);
  });
});

describe("normalizeChartType", () => {
  it("collapses slug, legacy, and per-genre encodings to one type", () => {
    const expectations: Array<[string | null, ChartType | null]> = [
      ["top-free", "free"],
      ["top-paid:Business", "paid"],
      ["topgrossingapplications", "grossing"],
      ["TOP-FREE", "free"],
      ["nonsense", null],
      [null, null],
    ];
    for (const [raw, expected] of expectations) {
      expect(normalizeChartType(raw)).toBe(expected);
    }
  });
});
