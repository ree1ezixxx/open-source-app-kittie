#!/usr/bin/env node
// COLD-path latency bench — the honest check. Every request uses a DISTINCT query so
// the in-process read cache never hides the real DB cost (warm requests are ~2ms and
// would be a false-green). Run against a freshly-booted API (cache cold) for true cold
// numbers; tsx-watch reload between code changes resets the cache automatically.
//
// Usage: node scripts/bench-cold.mjs [baseUrl]   (default http://localhost:3013)

const BASE = process.argv[2] || "http://localhost:3013";

const SEARCH_TERMS = [
  "fitness","meditation","budget","zombie","crochet","weather","podcast","recipe","invoice","habit",
  "running","guitar","language","photo","sleep","calendar","crypto","poker","drawing","yoga",
  "notes","timer","scanner","wallet","puzzle","camera","music","novel","chess","plant",
  "fasting","therapy","dating","resume","traffic","stocks","comic","piano","golf","dream",
];
const RATINGS = [3, 3.4, 3.7, 4, 4.2, 4.4, 4.6, 4.8];
const SORTS = [
  ["reviews", "desc"], ["revenue", "desc"], ["rating", "desc"], ["rankDelta", "desc"],
  ["reviews", "asc"], ["revenue", "asc"], ["rankDelta", "asc"], ["rating", "asc"],
];
const COUNTRIES = ["US", "GB", "CA", "DE", "FR", "JP", "AU", "BR", "IN", "KR"];
const CHART_TYPES = ["free", "paid", "grossing"];

function pct(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}
async function timeOnce(url) {
  const t0 = performance.now();
  const res = await fetch(url);
  await res.arrayBuffer();
  return { ms: performance.now() - t0, status: res.status };
}
async function suite(name, urls) {
  const samples = [];
  let bad = 0;
  for (const u of urls) {
    const r = await timeOnce(`${BASE}${u}`);
    if (r.status >= 400) bad++;
    samples.push(r.ms);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
  return {
    name, n: samples.length, bad,
    p50: pct(samples, 50), p95: pct(samples, 95), p99: pct(samples, 99),
    mean, max: samples[samples.length - 1],
  };
}
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(0) : "—");

async function main() {
  // Build DISTINCT query lists (each = cold cache miss)
  const searchUrls = SEARCH_TERMS.map((t) => `/api/v1/apps?limit=50&search=${t}`);
  const filterSortUrls = [];
  for (const r of RATINGS) for (const [by, ord] of SORTS) filterSortUrls.push(`/api/v1/apps?limit=50&minRating=${r}&sortBy=${by}&sortOrder=${ord}`);
  const chartUrls = [];
  for (const ctry of COUNTRIES) for (const ty of CHART_TYPES) chartUrls.push(`/api/v1/charts?store=apple&type=${ty}&country=${ctry}&limit=100`);

  const suites = [
    await suite("apps:search (cold)", searchUrls),
    await suite("apps:filter+sort (cold)", filterSortUrls),
    await suite("charts (uncached)", chartUrls),
  ];

  console.log(`\n# COLD bench @ ${BASE} — distinct queries, ${new Date().toISOString()}`);
  console.log("\n| suite | n | p50 | p95 | p99 | mean | max | errs |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const s of suites) {
    console.log(`| ${s.name} | ${s.n} | ${fmt(s.p50)} | ${fmt(s.p95)} | ${fmt(s.p99)} | ${fmt(s.mean)} | ${fmt(s.max)} | ${s.bad} |`);
  }
  const worst = Math.max(...suites.map((s) => s.p95));
  console.log(`\nworst-suite p95 = ${fmt(worst)}ms`);
}
main().catch((e) => { console.error(e); process.exit(1); });
