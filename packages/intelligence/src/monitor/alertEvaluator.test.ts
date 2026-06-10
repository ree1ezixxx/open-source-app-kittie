import { describe, expect, it } from "vitest";
import type { FieldChange } from "./capture.js";
import {
  DEFAULT_RULES,
  evaluateAlerts,
  type AlertRuleType,
  type RuleConfig,
} from "./alertEvaluator.js";

const PRIOR_AT = new Date("2026-06-01T00:00:00Z");
const CAPTURED_AT = new Date("2026-06-02T00:00:00Z");

function change(
  field: FieldChange["field"],
  oldValue: string | null,
  newValue: string | null,
  overrides: Partial<FieldChange> = {},
): FieldChange {
  return { field, oldValue, newValue, priorAt: PRIOR_AT, capturedAt: CAPTURED_AT, ...overrides };
}

function ruleConfig(rule: AlertRuleType, overrides: Partial<RuleConfig> = {}): RuleConfig {
  const defaults = DEFAULT_RULES.find((entry) => entry.rule === rule);
  return {
    id: `rule-${rule}`,
    rule,
    threshold: defaults?.threshold ?? null,
    enabled: true,
    ...overrides,
  };
}

const ALL_RULES = DEFAULT_RULES.map((entry) => ruleConfig(entry.rule));

function hoursBefore(date: Date, hours: number): Date {
  return new Date(date.getTime() - hours * 3_600_000);
}

describe("rank_shift", () => {
  it("fires at the threshold boundary", () => {
    const result = evaluateAlerts([change("chart_rank", "45", "35")], [ruleConfig("rank_shift")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe("rank_shift");
    expect(result[0]?.summary).toBe("Chart rank 45 → 35");
  });

  it("does not fire below the threshold", () => {
    const result = evaluateAlerts([change("chart_rank", "45", "37")], [ruleConfig("rank_shift")]);
    expect(result).toHaveLength(0);
  });

  it("fires on a rise as well as a fall", () => {
    const result = evaluateAlerts([change("chart_rank", "12", "45")], [ruleConfig("rank_shift")]);
    expect(result).toHaveLength(1);
  });

  it("suppresses entering a chart (null → ranked)", () => {
    const result = evaluateAlerts([change("chart_rank", null, "5")], [ruleConfig("rank_shift")]);
    expect(result).toHaveLength(0);
  });

  it("suppresses leaving a chart (ranked → null)", () => {
    const result = evaluateAlerts([change("chart_rank", "5", null)], [ruleConfig("rank_shift")]);
    expect(result).toHaveLength(0);
  });

  it("falls back to the default threshold when the rule threshold is null", () => {
    const rule = ruleConfig("rank_shift", { threshold: null });
    expect(evaluateAlerts([change("chart_rank", "45", "35")], [rule])).toHaveLength(1);
    expect(evaluateAlerts([change("chart_rank", "45", "37")], [rule])).toHaveLength(0);
  });
});

describe("rating_drop", () => {
  it("fires at the threshold boundary despite float noise", () => {
    const result = evaluateAlerts([change("rating", "4.7", "4.5")], [ruleConfig("rating_drop")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.summary).toBe("Rating 4.7 → 4.5");
  });

  it("does not fire below the threshold", () => {
    const result = evaluateAlerts([change("rating", "4.7", "4.6")], [ruleConfig("rating_drop")]);
    expect(result).toHaveLength(0);
  });

  it("never fires on a rise", () => {
    const result = evaluateAlerts([change("rating", "4.5", "4.8")], [ruleConfig("rating_drop")]);
    expect(result).toHaveLength(0);
  });

  it("suppresses one-sided null ratings", () => {
    expect(evaluateAlerts([change("rating", null, "4.5")], [ruleConfig("rating_drop")])).toHaveLength(0);
    expect(evaluateAlerts([change("rating", "4.5", null)], [ruleConfig("rating_drop")])).toHaveLength(0);
  });
});

describe("revenue_swing", () => {
  it("fires at the percent threshold boundary", () => {
    const result = evaluateAlerts(
      [change("revenue_estimate", "1000", "1250")],
      [ruleConfig("revenue_swing")],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.summary).toBe("Revenue estimate $1,000 → $1,250 (+25%)");
  });

  it("does not fire below the percent threshold", () => {
    const result = evaluateAlerts(
      [change("revenue_estimate", "1000", "1240")],
      [ruleConfig("revenue_swing")],
    );
    expect(result).toHaveLength(0);
  });

  it("fires on a drop of equal magnitude", () => {
    const result = evaluateAlerts(
      [change("revenue_estimate", "1000", "750")],
      [ruleConfig("revenue_swing")],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.summary).toBe("Revenue estimate $1,000 → $750 (-25%)");
  });

  it("suppresses a swing from zero (impossible percent base)", () => {
    const result = evaluateAlerts(
      [change("revenue_estimate", "0", "500")],
      [ruleConfig("revenue_swing")],
    );
    expect(result).toHaveLength(0);
  });

  it("suppresses one-sided null estimates", () => {
    expect(
      evaluateAlerts([change("revenue_estimate", null, "500")], [ruleConfig("revenue_swing")]),
    ).toHaveLength(0);
    expect(
      evaluateAlerts([change("revenue_estimate", "500", null)], [ruleConfig("revenue_swing")]),
    ).toHaveLength(0);
  });
});

describe("price_change", () => {
  it("fires on any recorded price change", () => {
    const result = evaluateAlerts([change("price", "9.99", "14.99")], [ruleConfig("price_change")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.summary).toBe("Price $9.99 → $14.99");
  });

  it("fires on became-paid (null → price)", () => {
    const result = evaluateAlerts([change("price", null, "4.99")], [ruleConfig("price_change")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.summary).toBe("Price Free → $4.99");
  });

  it("fires on became-free (price → null)", () => {
    const result = evaluateAlerts([change("price", "4.99", null)], [ruleConfig("price_change")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.summary).toBe("Price $4.99 → Free");
  });
});

describe("metadata_change", () => {
  it("fires on every metadata field", () => {
    const changes: FieldChange[] = [
      change("title", "Old Name", "New Name"),
      change("description", "old copy", "new copy"),
      change("category", "Games", "Finance"),
      change("content_rating", "4+", "17+"),
      change("screenshot_urls", JSON.stringify(["a", "b"]), JSON.stringify(["a", "c"])),
    ];
    const result = evaluateAlerts(changes, [ruleConfig("metadata_change")]);
    expect(result).toHaveLength(5);
    expect(result.every((candidate) => candidate.rule === "metadata_change")).toBe(true);
    expect(result[0]?.summary).toBe('Title "Old Name" → "New Name"');
    expect(result[2]?.summary).toBe("Category Games → Finance");
  });

  it("derives added/removed counts for screenshots", () => {
    const result = evaluateAlerts(
      [
        change(
          "screenshot_urls",
          JSON.stringify(["a", "b"]),
          JSON.stringify(["a", "c", "d", "e"]),
        ),
      ],
      [ruleConfig("metadata_change")],
    );
    expect(result[0]?.summary).toBe("Screenshots updated (3 added, 1 removed)");
  });

  it("does not fire on non-metadata fields", () => {
    const result = evaluateAlerts(
      [change("chart_rank", "45", "12"), change("price", "9.99", "14.99")],
      [ruleConfig("metadata_change")],
    );
    expect(result).toHaveLength(0);
  });
});

describe("trust gate", () => {
  it("suppresses a diff straddling more than gapToleranceHours", () => {
    const gappy = change("chart_rank", "45", "12", {
      priorAt: hoursBefore(CAPTURED_AT, 72),
    });
    expect(evaluateAlerts([gappy], ALL_RULES)).toHaveLength(0);
  });

  it("allows a pair exactly at the gap tolerance", () => {
    const edge = change("chart_rank", "45", "12", {
      priorAt: hoursBefore(CAPTURED_AT, 48),
    });
    expect(evaluateAlerts([edge], ALL_RULES)).toHaveLength(1);
  });

  it("honours a custom gapToleranceHours", () => {
    const gappy = change("chart_rank", "45", "12", {
      priorAt: hoursBefore(CAPTURED_AT, 72),
    });
    expect(evaluateAlerts([gappy], ALL_RULES, { gapToleranceHours: 72 })).toHaveLength(1);
  });

  it("suppresses a time-reversed capture pair", () => {
    const reversed = change("chart_rank", "45", "12", {
      priorAt: new Date(CAPTURED_AT.getTime() + 3_600_000),
    });
    expect(evaluateAlerts([reversed], ALL_RULES)).toHaveLength(0);
  });

  it("disabled rules never fire", () => {
    const result = evaluateAlerts(
      [change("price", "9.99", "14.99")],
      [ruleConfig("price_change", { enabled: false })],
    );
    expect(result).toHaveLength(0);
  });

  it("review_count never produces an alert", () => {
    const result = evaluateAlerts([change("review_count", "100", "100000")], ALL_RULES);
    expect(result).toHaveLength(0);
  });

  it("new_ad_creative cannot fire on any recorded field", () => {
    const everyField: FieldChange[] = [
      change("title", "a", "b"),
      change("description", "a", "b"),
      change("price", "1", "2"),
      change("category", "a", "b"),
      change("content_rating", "a", "b"),
      change("screenshot_urls", "[]", '["x"]'),
      change("rating", "4.9", "4.0"),
      change("review_count", "1", "2"),
      change("chart_rank", "50", "1"),
      change("revenue_estimate", "100", "200"),
      change("downloads_estimate", "100", "200"),
    ];
    const result = evaluateAlerts(everyField, ALL_RULES);
    expect(result.some((candidate) => candidate.rule === "new_ad_creative")).toBe(false);
  });
});

describe("cooldown", () => {
  it("suppresses a repeat of the same rule inside the window", () => {
    const result = evaluateAlerts([change("price", "9.99", "14.99")], [ruleConfig("price_change")], {
      recentAlerts: [{ rule: "price_change", capturedAt: hoursBefore(CAPTURED_AT, 12) }],
    });
    expect(result).toHaveLength(0);
  });

  it("fires again exactly at the cooldown edge", () => {
    const result = evaluateAlerts([change("price", "9.99", "14.99")], [ruleConfig("price_change")], {
      recentAlerts: [{ rule: "price_change", capturedAt: hoursBefore(CAPTURED_AT, 24) }],
    });
    expect(result).toHaveLength(1);
  });

  it("ignores recent alerts of a different rule", () => {
    const result = evaluateAlerts([change("price", "9.99", "14.99")], [ruleConfig("price_change")], {
      recentAlerts: [{ rule: "rank_shift", capturedAt: hoursBefore(CAPTURED_AT, 1) }],
    });
    expect(result).toHaveLength(1);
  });

  it("honours a custom cooldownHours", () => {
    const recentAlerts = [{ rule: "price_change" as const, capturedAt: hoursBefore(CAPTURED_AT, 36) }];
    expect(
      evaluateAlerts([change("price", "9.99", "14.99")], [ruleConfig("price_change")], {
        cooldownHours: 48,
        recentAlerts,
      }),
    ).toHaveLength(0);
    expect(
      evaluateAlerts([change("price", "9.99", "14.99")], [ruleConfig("price_change")], {
        cooldownHours: 24,
        recentAlerts,
      }),
    ).toHaveLength(1);
  });
});

describe("batch evaluation", () => {
  it("emits one candidate per clearing change, preserving change order", () => {
    const changes: FieldChange[] = [
      change("chart_rank", "45", "12"),
      change("price", "9.99", "14.99"),
      change("title", "Old", "New"),
      change("rating", "4.7", "4.65"),
    ];
    const result = evaluateAlerts(changes, ALL_RULES);
    expect(result.map((candidate) => candidate.rule)).toEqual([
      "rank_shift",
      "price_change",
      "metadata_change",
    ]);
    expect(result.map((candidate) => candidate.ruleId)).toEqual([
      "rule-rank_shift",
      "rule-price_change",
      "rule-metadata_change",
    ]);
    expect(result[0]?.change).toBe(changes[0]);
  });
});
