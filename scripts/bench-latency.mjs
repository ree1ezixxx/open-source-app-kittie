#!/usr/bin/env node
// Repeatable latency bench for Kittie hot endpoints — the loop's ground-truth check.
// Usage: node scripts/bench-latency.mjs [baseUrl] [runs]
//   baseUrl defaults to http://localhost:3013, runs defaults to 30.
// Prints p50/p95/p99/mean/max (ms) + payload bytes per endpoint, and a markdown table.

const BASE = process.argv[2] || "http://localhost:3013";
const RUNS = Number(process.argv[3] || 30);
const WARM = 3;

function pct(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

async function timeOnce(url) {
  const t0 = performance.now();
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const ms = performance.now() - t0;
  return { ms, ok: res.ok, status: res.status, bytes: buf.byteLength };
}

async function benchEndpoint(name, path) {
  const url = `${BASE}${path}`;
  let lastBytes = 0,
    lastStatus = 0;
  for (let i = 0; i < WARM; i++) {
    try {
      const r = await timeOnce(url);
      lastStatus = r.status;
    } catch (e) {
      return { name, path, error: String(e) };
    }
  }
  const samples = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await timeOnce(url);
    samples.push(r.ms);
    lastBytes = r.bytes;
    lastStatus = r.status;
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
  return {
    name,
    path,
    status: lastStatus,
    bytes: lastBytes,
    p50: pct(samples, 50),
    p95: pct(samples, 95),
    p99: pct(samples, 99),
    mean,
    max: samples[samples.length - 1],
  };
}

async function discoverAppId() {
  try {
    const res = await fetch(`${BASE}/api/v1/apps?limit=1`);
    const body = await res.json();
    const row = body?.data?.[0];
    return row?.storeAppId || row?.id || null;
  } catch {
    return null;
  }
}

const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : "—");

async function main() {
  const appId = await discoverAppId();
  const endpoints = [
    ["apps:list (default)", "/api/v1/apps?limit=50"],
    ["apps:list (revenue desc)", "/api/v1/apps?limit=50&sortBy=revenue&sortOrder=desc"],
    ["apps:categories", "/api/v1/apps/categories"],
    ["charts (apple/free/US)", "/api/v1/charts?store=apple&type=free&country=US&limit=100"],
    ["ideas", "/api/v1/ideas?limit=50"],
  ];
  if (appId) endpoints.push([`apps:detail (${appId})`, `/api/v1/apps/${encodeURIComponent(appId)}`]);

  const results = [];
  for (const [name, path] of endpoints) {
    process.stderr.write(`benching ${name} … `);
    const r = await benchEndpoint(name, path);
    results.push(r);
    process.stderr.write(r.error ? `ERROR ${r.error}\n` : `p95=${fmt(r.p95)}ms\n`);
  }

  console.log(`\n# Bench @ ${BASE} — ${RUNS} runs (after ${WARM} warm), ${new Date().toISOString()}`);
  console.log("\n| endpoint | status | p50 ms | p95 ms | p99 ms | mean ms | max ms | KB |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    if (r.error) {
      console.log(`| ${r.name} | ERR | — | — | — | — | — | — |`);
      continue;
    }
    console.log(
      `| ${r.name} | ${r.status} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${fmt(r.mean)} | ${fmt(r.max)} | ${(r.bytes / 1024).toFixed(1)} |`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
