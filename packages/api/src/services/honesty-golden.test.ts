/**
 * Golden honesty suite for the decision ladder (#275, epic #269) — makes
 * "truthful under weak evidence" regression-testable, not vibes. Runs the REAL
 * services against a deterministic fixture DB (real schema via migrations),
 * with only the network seams stubbed (autocomplete; Gemini is unconfigured →
 * deterministic paths, which is what production runs today).
 *
 * Five assertion families × the three ladder tools:
 *   1. No fabrication — zero-evidence fields are null/insufficient, never invented.
 *   2. Calibration — confidence drops when evidence is withheld; `high` never
 *      appears alongside a missing primary source.
 *   3. Coverage honesty — sourceCoverage matches what the fixture ACTUALLY holds.
 *   4. Refusal — nonsense refuses; sparse degrades to the correct rung/status.
 *   5. Agent usability — envelope invariants hold; quotes carry no reviewer PII.
 *
 * Lives in packages/api (not apps/eval) so `pnpm -r test` — the CI gate —
 * enforces it on every PR; apps/eval remains the live MCP shadow harness.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "kittie-honesty-"));
const dbFile = path.join(tmpDir, "honesty.db");
process.env.DATABASE_URL = `file:${dbFile}`;
// Determinism: the machine may carry a global GEMINI_API_KEY (shell env) — this
// suite MUST run the deterministic paths, so the seam is pinned off before any
// import can read it.
process.env.GEMINI_API_KEY = "";

const { createDb, ensureAppsFts } = await import("@kittie/db");
const { getReviewClusters } = await import("./review-clusters-service.js");
const { getFeatureGaps } = await import("./feature-gaps-service.js");
const { getWhitespaceIdeas } = await import("./whitespace-service.js");
const { recallReviewedApps } = await import("./evidence-recall.js");
const { findSimilarApps } = await import("./similar-apps-service.js");

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "..", "packages", "db", "drizzle",
);
const db = createDb(`file:${dbFile}`);

async function applyMigrations(): Promise<void> {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sqlText = readFileSync(path.join(migrationsDir, f), "utf8");
    for (const stmt of sqlText.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) await db.run(trimmed);
    }
  }
}

/* ── fixture corpus ────────────────────────────────────────────────────────
   RICH niche: 4 sleep apps, 3 with dated+tagged reviews (one recent, one old
   per app), EN descriptions. SPARSE niche: 2 meditation apps, zero reviews. */
const NOW = Date.now();
const daysAgo = (d: number) => Math.floor((NOW - d * 86_400_000) / 1000);

interface FixtureApp { id: string; title: string; category: string; description: string }
const RICH: FixtureApp[] = [
  { id: "apple:9001", title: "Sleep Tracking Well", category: "Health & Fitness", description: "Track your sleep with smart alarms, cloud sync across devices and dark mode." },
  { id: "apple:9002", title: "Pillow Sleep Tracking", category: "Health & Fitness", description: "Sleep tracking with iCloud sync and Apple Watch support." },
  { id: "apple:9003", title: "Sleep Diary DozeLog", category: "Health & Fitness", description: "A simple sleep diary with reminders and CSV export." },
  { id: "apple:9004", title: "Sleep Sounds NightOwl", category: "Health & Fitness", description: "Sleep sounds and stories. Premium subscription unlocks the full library." },
];
const SPARSE: FixtureApp[] = [
  { id: "apple:9101", title: "StillMind Meditation", category: "Health & Fitness", description: "Guided meditation sessions for calm and focus." },
  { id: "apple:9102", title: "BreatheEasy Meditation", category: "Health & Fitness", description: "Breathing exercises and meditation timers." },
];

async function seed(): Promise<void> {
  for (const a of [...RICH, ...SPARSE]) {
    const storeAppId = a.id.split(":")[1]!;
    await db.run(
      `INSERT INTO apps (id, store, store_app_id, title, developer, category, description, price, first_seen_at, last_snapshot_date)
       VALUES ('${a.id}', 'apple', '${storeAppId}', '${a.title}', 'Fixture Dev', '${a.category}', '${a.description.replace(/'/g, "''")}', 0, 0, '${new Date(NOW).toISOString().slice(0, 10)}')`,
    );
  }
  // one current snapshot per app — discovery builds AppListItems from snapshots.
  const today = new Date(NOW).toISOString().slice(0, 10);
  let sn = 0;
  for (const a of [...RICH, ...SPARSE]) {
    await db.run(
      `INSERT INTO app_snapshots (id, app_id, snapshot_date, review_count, rating, chart_country, growth_score, revenue_estimate, created_at)
       VALUES ('snap-${sn}', '${a.id}', '${today}', ${a.id.endsWith("9004") || SPARSE.some((x) => x.id === a.id) ? 0 : 2}, 4.0, 'US', 55, 20000, ${daysAgo(0)})`,
    );
    sn += 1;
  }
  // reviews: apps 9001-9003 get 2 each (one 10d old, one 250d old); 9004 none.
  const bodies: Array<[string, string, number, string, string]> = [
    // [appId, body, rating, topicsJson, improvementsJson]
    ["apple:9001", "The sleep staging is wildly inaccurate, marked wrong every night.", 1, '["Stability & Performance"]', '["Accuracy Failure"]'],
    ["apple:9001", "Please add an offline mode, useless without internet on flights.", 2, '["Feature Requests"]', '["Missing Export & Portability"]'],
    ["apple:9002", "Cancelled but they kept charging me for premium.", 1, '["Billing & Refunds"]', '["Trial & Billing Deception"]'],
    ["apple:9002", "Love the smart alarm, sync across devices is flawless.", 5, '["Content Quality"]', "[]"],
    ["apple:9003", "Too many ads between every screen now.", 2, '["Ads Experience"]', '["Ad Intrusiveness"]'],
    ["apple:9003", "The guilt trip notifications are unbearable, no way to turn off the daily reminders.", 1, '["Notifications"]', '["Notification Fatigue"]'],
  ];
  let i = 0;
  for (const [appId, body, rating, topics, areas] of bodies) {
    const age = i % 2 === 0 ? 10 : 250; // one recent, one old per app
    await db.run(
      `INSERT INTO reviews (id, app_id, store, country, rating, title, body, author, reviewed_at, ingested_at, sentiment, topics, improvement_areas)
       VALUES ('rev-${i}', '${appId}', 'apple', 'US', ${rating}, NULL, '${body.replace(/'/g, "''")}', 'FIXTURE AUTHOR — MUST NEVER LEAK', ${daysAgo(age)}, ${daysAgo(1)}, '${rating >= 4 ? "positive" : "negative"}', '${topics}', '${areas}')`,
    );
    i += 1;
  }
}

const RICH_IDS = RICH.map((a) => a.id);
const SPARSE_IDS = SPARSE.map((a) => a.id);

/** Whitespace deps: REAL composed services on the fixture DB; only the
    network autocomplete seam is stubbed (deterministic). */
function whitespaceDeps(keywords: string[]) {
  return {
    relatedKeywords: async () => keywords,
    findSimilarApps,
    fetchThemes: async (appIds: string[], country: string) => {
      const res = await getReviewClusters({ appIds, country, maxReviewsPerApp: 100 });
      const sc = res.data.sourceCoverage;
      return {
        themes: res.data.themes,
        reviewsAnalyzed: res.data.totalReviewsAnalyzed,
        perAppReviews: res.data.coverage.map((c) => ({ appId: c.appId, reviewsAnalyzed: c.reviewsAnalyzed })),
        reviewDateRange: sc.reviewDateRange,
        localesSeen: sc.localesSeen,
        appsWithReviews: sc.appsWithReviews,
      };
    },
    fetchFeatures: async (appIds: string[], country: string) => (await getFeatureGaps({ appIds, country })).data.features,
    phrase: async () => null,
    now: () => new Date(NOW),
  };
}

beforeAll(async () => {
  await applyMigrations();
  await seed();
  await ensureAppsFts(db); // discovery (find_similar_apps) needs the FTS index
});
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

/* ── 1. No fabrication ───────────────────────────────────────────────────── */
describe("honesty: no fabrication", () => {
  it("cluster_reviews on a reviewless set → insufficient, all-null coverage, zero themes", async () => {
    const res = await getReviewClusters({ appIds: SPARSE_IDS });
    expect(res.status).toBe("insufficient");
    expect(res.confidence.score).toBe(0);
    expect(res.data.themes).toHaveLength(0);
    const sc = res.data.sourceCoverage;
    expect(sc.reviewDateRange).toBeNull();
    expect(sc.recentFraction).toBeNull();
    expect(sc.localesSeen).toEqual([]);
    // Mutation-probe gap (cold-verify a-v1): the missing-source caveat itself
    // is part of the honesty contract — pin its presence, not just the score.
    expect(res.caveats.some((c) => c.kind === "missing_source" && c.sourceType === "review")).toBe(true);
  });

  it("feature_gaps demand stays unknown without review evidence — never guessed", async () => {
    const res = await getFeatureGaps({ appIds: SPARSE_IDS });
    expect(res.data.features.every((f) => f.demand === "unknown")).toBe(true);
    expect(res.data.gaps).toHaveLength(0); // a gap REQUIRES demand evidence
  });
});

/* ── 2. Calibration ──────────────────────────────────────────────────────── */
describe("honesty: calibration under withheld evidence", () => {
  it("withholding reviews is DECLARED, and less review evidence never scores higher (like-for-like)", async () => {
    // Spec (#273): a reviews-off gaps run stands on the LISTING corpus — a
    // different evidence base, so its score is not comparable to reviews-on.
    // What must hold: the withholding is declared, and the review source is
    // marked missing.
    const withoutReviews = await getFeatureGaps({ appIds: RICH_IDS, includeReviewSignals: false });
    expect(withoutReviews.confidence.reasons.some((r) => r.includes("standing on listings only"))).toBe(true);
    expect(withoutReviews.data.sourceCoverage.notes.find((n) => n.sourceType === "review")?.status).toBe("missing");
    // Like-for-like monotonicity: SAME requested set, evidence capped — less
    // analyzed evidence never scores higher. (Different requested sets are NOT
    // comparable by design: spread measures corroboration within the request.)
    const full = await getReviewClusters({ appIds: RICH_IDS });
    const capped = await getReviewClusters({ appIds: RICH_IDS, maxReviewsPerApp: 1 });
    expect(capped.data.sourceCoverage.reviewsAnalyzed).toBeLessThan(full.data.sourceCoverage.reviewsAnalyzed);
    expect(capped.confidence.score).toBeLessThanOrEqual(full.confidence.score);
  });

  it("`high` never coexists with a missing primary source", async () => {
    for (const res of [await getReviewClusters({ appIds: SPARSE_IDS }), await getReviewClusters({ appIds: RICH_IDS })]) {
      const missingPrimary = res.caveats.some((c) => c.kind === "missing_source");
      if (missingPrimary) expect(res.confidence.label).not.toBe("high");
    }
  });

  it("confidence is auditable: recomputable from the response's own sourceCoverage", async () => {
    const res = await getReviewClusters({ appIds: RICH_IDS });
    const { calibrateConfidence } = await import("@kittie/intelligence");
    const sc = res.data.sourceCoverage;
    const recomputed = calibrateConfidence({
      evidenceUnits: sc.reviewsAnalyzed,
      evidenceTarget: 100,
      appsContributing: sc.appsWithReviews,
      appsResolved: sc.appsResolved,
      recentFraction: sc.recentFraction,
      sourceTypesPresent: sc.notes.filter((n) => n.status !== "missing").length,
      sourceTypesConsulted: sc.notes.length,
      llmEnriched: res.data.enrichment === "llm",
      requestedLocale: res.data.country,
      localesSeen: sc.localesSeen,
    });
    expect(recomputed.score).toBe(res.confidence.score);
  });
});

/* ── 3. Coverage honesty ─────────────────────────────────────────────────── */
describe("honesty: sourceCoverage matches the fixture exactly", () => {
  it("cluster_reviews counts what the DB actually holds", async () => {
    const res = await getReviewClusters({ appIds: RICH_IDS });
    const sc = res.data.sourceCoverage;
    expect(sc.appsResolved).toBe(4);
    expect(sc.appsWithReviews).toBe(3); // 9004 holds none
    expect(sc.reviewsAnalyzed).toBe(6);
    expect(sc.recentFraction).toBe(0.5); // 3 of 6 within 180d, by construction
    expect(sc.localesSeen).toEqual(["US"]);
    expect(sc.notes).toEqual([{ sourceType: "review", status: "partial" }]);
  });

  it("feature_gaps reports listing coverage truthfully", async () => {
    const res = await getFeatureGaps({ appIds: RICH_IDS });
    const sc = res.data.sourceCoverage;
    expect(sc.appsWithDescriptions).toBe(4);
    expect(sc.appsWithReviews).toBe(3);
    expect(res.data.features.length).toBeGreaterThan(0); // sync/export/premium in listings
  });
});

/* ── 4. Refusal ──────────────────────────────────────────────────────────── */
describe("honesty: refusal semantics", () => {
  it("nonsense category refuses the whole funnel with dead tokens named", async () => {
    const res = await getWhitespaceIdeas(
      { category: "zzqx flurbin sleep" },
      whitespaceDeps(["sleep tracker for kids", "sleep sounds"]), // echoes only the real token
    );
    expect(res.status).toBe("insufficient");
    expect(res.data.ideas).toHaveLength(0);
    expect(res.data.funnel.refused).toBeGreaterThan(0);
    expect(res.caveats.some((c) => c.message.includes('"zzqx"'))).toBe(true);
  });

  it("real category over the fixture corpus ranks with cited gate reasons", async () => {
    const res = await getWhitespaceIdeas(
      { category: "sleep", limit: 2 },
      whitespaceDeps(["sleep tracking", "sleep diary"]),
    );
    expect(res.status).toBe("ok");
    expect(res.data.ideas.length).toBeGreaterThan(0);
    for (const idea of res.data.ideas) {
      expect(["ranked", "low_confidence", "needs_more_sources"]).toContain(idea.gateRung);
      expect(idea.gateReason.length).toBeGreaterThan(20);
      if (idea.gateRung === "needs_more_sources") expect(idea.score).toBeNull();
    }
  });
});

/* ── 5. Agent usability ──────────────────────────────────────────────────── */
describe("honesty: agent usability invariants", () => {
  it("quotes never leak reviewer identity", async () => {
    const res = await getReviewClusters({ appIds: RICH_IDS });
    const raw = JSON.stringify(res);
    expect(raw).not.toContain("FIXTURE AUTHOR");
    for (const t of res.data.themes) {
      for (const q of t.quotes) expect(Object.keys(q).sort()).toEqual(["appId", "appName", "date", "rating", "text"]);
    }
  });

  it("envelope invariants hold across all three tools", async () => {
    const responses = [
      await getReviewClusters({ appIds: RICH_IDS }),
      await getFeatureGaps({ appIds: RICH_IDS }),
      await getWhitespaceIdeas({ category: "sleep", limit: 2 }, whitespaceDeps(["sleep tracking"])),
    ];
    for (const res of responses) {
      expect(["ok", "partial", "insufficient"]).toContain(res.status);
      expect(res.confidence.score).toBeGreaterThanOrEqual(0);
      expect(res.confidence.score).toBeLessThanOrEqual(0.9);
      expect(res.confidence.reasons.length).toBeGreaterThan(0);
      expect(res.metadata.generatedAt).toBeTruthy();
      expect(res.data.sourceCoverage).toBeDefined();
    }
  });
});
