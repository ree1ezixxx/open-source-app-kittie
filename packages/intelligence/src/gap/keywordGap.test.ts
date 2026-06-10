import { describe, expect, it } from "vitest";
import {
  keywordGap,
  localizationGap,
  marketPresence,
  type IndexRow,
} from "./keywordGap.js";

const SUBJECT = "app-subject";
const C1 = "app-c1";
const C2 = "app-c2";

function row(
  partial: Partial<IndexRow> & Pick<IndexRow, "keywordId" | "appId" | "rank">,
): IndexRow {
  return {
    keyword: partial.keywordId,
    country: "us",
    store: "apple",
    popularity: null,
    difficulty: null,
    ...partial,
  };
}

describe("keywordGap", () => {
  const rows: IndexRow[] = [
    // k1 us/apple: two competitors in top 10, subject absent → gap
    row({ keywordId: "k1", keyword: "meditation timer", appId: C1, rank: 3, popularity: 80, difficulty: 40 }),
    row({ keywordId: "k1", keyword: "meditation timer", appId: C2, rank: 7 }),
    // k1 gb/google: same keyword, other market — subject leads there → shared
    row({ keywordId: "k1", keyword: "meditation timer", country: "gb", store: "google", appId: SUBJECT, rank: 1, popularity: 30, difficulty: 70 }),
    row({ keywordId: "k1", keyword: "meditation timer", country: "gb", store: "google", appId: C1, rank: 2 }),
    // k2: subject ranks 12 (below topRank) → still a gap; C2 at 30 not counted in top
    row({ keywordId: "k2", keyword: "sleep sounds", appId: C1, rank: 5, popularity: 60, difficulty: 20 }),
    row({ keywordId: "k2", keyword: "sleep sounds", appId: C2, rank: 30 }),
    row({ keywordId: "k2", keyword: "sleep sounds", appId: SUBJECT, rank: 12 }),
    // k3: both inside topRank → shared
    row({ keywordId: "k3", keyword: "focus app", appId: SUBJECT, rank: 2, popularity: 50, difficulty: 50 }),
    row({ keywordId: "k3", keyword: "focus app", appId: C1, rank: 6 }),
    // k4: subject in, competitor's best is 15 → subjectOnly (moat)
    row({ keywordId: "k4", keyword: "habit tracker", appId: SUBJECT, rank: 4, popularity: 90, difficulty: 10 }),
    row({ keywordId: "k4", keyword: "habit tracker", appId: C1, rank: 15 }),
    // k5: boundary — competitor exactly at topRank is in, subject at 11 is out
    row({ keywordId: "k5", keyword: "white noise", appId: C1, rank: 10 }),
    row({ keywordId: "k5", keyword: "white noise", appId: SUBJECT, rank: 11 }),
    // k6: competitor only at 11 — falls in no partition
    row({ keywordId: "k6", keyword: "calm music", appId: C1, rank: 11 }),
    // untracked app must be invisible to the analysis
    row({ keywordId: "k1", keyword: "meditation timer", appId: "app-stranger", rank: 1 }),
  ];

  it("partitions keywords into gaps, shared, and subjectOnly per market", () => {
    const result = keywordGap(SUBJECT, [C1, C2], rows);

    expect(result.gaps.map((g) => `${g.keywordId}:${g.country}:${g.store}`)).toEqual([
      "k1:us:apple",
      "k2:us:apple",
      "k5:us:apple",
    ]);
    expect(
      result.shared.map((g) => `${g.keywordId}:${g.country}:${g.store}`).sort(),
    ).toEqual(["k1:gb:google", "k3:us:apple"]);
    expect(result.subjectOnly.map((g) => g.keywordId)).toEqual(["k4"]);
  });

  it("treats topRank as inclusive: rank 10 is in, rank 11 is out", () => {
    const result = keywordGap(SUBJECT, [C1, C2], rows);
    const k5 = result.gaps.find((g) => g.keywordId === "k5");

    expect(k5).toBeDefined();
    expect(k5?.bestCompetitorRank).toBe(10);
    expect(k5?.subjectRank).toBe(11);
    const everywhere = [...result.gaps, ...result.shared, ...result.subjectOnly];
    expect(everywhere.some((g) => g.keywordId === "k6")).toBe(false);
  });

  it("counts only distinct competitors inside topRank, ignoring untracked apps", () => {
    const result = keywordGap(SUBJECT, [C1, C2], rows);
    const k1 = result.gaps.find((g) => g.keywordId === "k1");
    const k2 = result.gaps.find((g) => g.keywordId === "k2");

    expect(k1?.competitorCount).toBe(2);
    expect(k1?.subjectRank).toBeNull();
    expect(k1?.bestCompetitorRank).toBe(3);
    expect(k2?.competitorCount).toBe(1);
    expect(k2?.subjectRank).toBe(12);
  });

  it("reports the nearest competitor threat on the moat", () => {
    const result = keywordGap(SUBJECT, [C1, C2], rows);
    const k4 = result.subjectOnly[0];

    expect(k4?.bestCompetitorRank).toBe(15);
    expect(k4?.competitorCount).toBe(0);
  });

  it("orders gaps by opportunity desc, defaulting unscored keywords to neutral", () => {
    const result = keywordGap(SUBJECT, [C1, C2], rows);

    // k1: 80/40 → 50; k2: 60/20 → 48; k5: null/null → 0/50 → 15
    expect(result.gaps.map((g) => g.opportunity)).toEqual([50, 48, 15]);
  });

  it("tie-breaks equal opportunity by bestCompetitorRank asc", () => {
    const tieRows: IndexRow[] = [
      row({ keywordId: "t1", appId: C1, rank: 4, popularity: 50, difficulty: 50 }),
      row({ keywordId: "t2", appId: C1, rank: 2, popularity: 50, difficulty: 50 }),
    ];
    const result = keywordGap(SUBJECT, [C1], tieRows);

    expect(result.gaps.map((g) => g.keywordId)).toEqual(["t2", "t1"]);
  });
});

describe("localizationGap", () => {
  const rows: IndexRow[] = [
    // us kA: boundary thresholds — popularity 40 and difficulty 60 both qualify
    row({ keywordId: "kA", appId: "a1", rank: 1, popularity: 40, difficulty: 60 }),
    row({ keywordId: "kA", appId: "a2", rank: 5 }),
    // us kB: popularity 39 — one below the bar, out
    row({ keywordId: "kB", appId: "a1", rank: 1, popularity: 39, difficulty: 10 }),
    // us kC: difficulty 61 — one above the bar, out
    row({ keywordId: "kC", appId: "a1", rank: 1, popularity: 90, difficulty: 61 }),
    // us kD: three distinct occupants — not fewer than maxOccupants, out
    row({ keywordId: "kD", appId: "a1", rank: 1, popularity: 90, difficulty: 10 }),
    row({ keywordId: "kD", appId: "a2", rank: 2 }),
    row({ keywordId: "kD", appId: "a3", rank: 3 }),
    // us kE: same app on both stores is ONE occupant → 2 distinct, opening
    row({ keywordId: "kE", appId: "a1", rank: 2, popularity: 70, difficulty: 30 }),
    row({ keywordId: "kE", store: "google", appId: "a1", rank: 4 }),
    row({ keywordId: "kE", appId: "a2", rank: 6 }),
    // us kF: everyone beyond topRank — zero occupants, opening
    row({ keywordId: "kF", appId: "a1", rank: 11, popularity: 50, difficulty: 50 }),
    row({ keywordId: "kF", appId: "a2", rank: 12 }),
    // gb: a single opening
    row({ keywordId: "kA", country: "gb", appId: "a1", rank: 1, popularity: 80, difficulty: 20 }),
  ];

  it("admits openings exactly at the popularity and difficulty boundaries", () => {
    const [us] = localizationGap(rows);

    expect(us?.country).toBe("us");
    expect(us?.openings.map((o) => o.keywordId).sort()).toEqual(["kA", "kE", "kF"]);
  });

  it("counts occupants as distinct apps inside topRank, collapsing stores", () => {
    const [us] = localizationGap(rows);
    const kE = us?.openings.find((o) => o.keywordId === "kE");
    const kF = us?.openings.find((o) => o.keywordId === "kF");

    expect(kE?.occupantCount).toBe(2);
    expect(kF?.occupantCount).toBe(0);
  });

  it("excludes fully occupied keywords until maxOccupants is raised", () => {
    const defaults = localizationGap(rows);
    const relaxed = localizationGap(rows, { maxOccupants: 4 });

    expect(defaults[0]?.openings.some((o) => o.keywordId === "kD")).toBe(false);
    expect(relaxed[0]?.openings.some((o) => o.keywordId === "kD")).toBe(true);
  });

  it("sorts openings by opportunity desc and markets by opening count desc", () => {
    const reports = localizationGap(rows);

    expect(reports.map((r) => r.country)).toEqual(["us", "gb"]);
    // kE: 70/30 → 49; kF: 50/50 → 35; kA: 40/60 → 28
    expect(reports[0]?.openings.map((o) => o.opportunity)).toEqual([49, 35, 28]);
    expect(reports[0]?.totalKeywords).toBe(6);
    expect(reports[1]?.totalKeywords).toBe(1);
  });
});

describe("marketPresence", () => {
  const rows: IndexRow[] = [
    row({ keywordId: "p1", appId: "a1", rank: 1 }),
    row({ keywordId: "p2", appId: "a1", rank: 10 }), // boundary in
    row({ keywordId: "p3", appId: "a1", rank: 11 }), // out
    row({ keywordId: "p1", store: "google", appId: "a1", rank: 3 }), // same keyword, counts once
    row({ keywordId: "p1", country: "gb", appId: "a1", rank: 2 }),
    row({ keywordId: "p1", appId: "a2", rank: 4 }),
    row({ keywordId: "p9", country: "gb", appId: "a2", rank: 20 }), // gb observed, a2 absent there
    row({ keywordId: "p1", appId: "untracked", rank: 1 }),
  ];

  it("counts distinct top-ranked keywords per app per market, zeros included", () => {
    const matrix = marketPresence(["a1", "a2", "a3"], rows);

    expect(matrix).toEqual([
      { appId: "a1", byCountry: { us: 2, gb: 1 } },
      { appId: "a2", byCountry: { us: 1, gb: 0 } },
      { appId: "a3", byCountry: { us: 0, gb: 0 } },
    ]);
  });

  it("widens presence when topRank is relaxed", () => {
    const matrix = marketPresence(["a1"], rows, { topRank: 11 });

    expect(matrix[0]?.byCountry["us"]).toBe(3);
  });
});
