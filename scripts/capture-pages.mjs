#!/usr/bin/env node
// Parity capture: for each query, follow nextCursor for N pages and print
// {ids, totalCount, cursorAppId} per page. cursorAppId decodes BOTH the legacy bare-id
// cursor and the new base64 keyset tuple to the underlying app id, so keyset vs legacy
// compare on the same boundary (decoded-equivalence) while ids+totalCount are byte-exact.
const BASE = process.argv[2] || "http://localhost:3013";
const PAGES = Number(process.argv[3] || 3);

const QUERIES = [
  "sortBy=reviews&sortOrder=desc",
  "minRating=4&sortBy=reviews&sortOrder=desc",
  "minRating=4&sortBy=rating&sortOrder=desc",
  "category=Games&sortBy=reviews&sortOrder=desc",
  "minRating=4.5&sortBy=reviews&sortOrder=desc&limit=10",
  // asc (keyset-eligible, non-null columns):
  "minRating=4&sortBy=reviews&sortOrder=asc",
  "minRating=4&sortBy=rating&sortOrder=asc",
  "sortBy=revenue&sortOrder=asc",
  "sortBy=rating&sortOrder=desc",
  "sortBy=revenue&sortOrder=desc",
  // negatives (must stay legacy / unchanged):
  "search=fitness&sortBy=reviews&sortOrder=desc",
  "sortBy=growth&sortOrder=desc",
  "sortBy=rankDelta&sortOrder=desc",
];

function decodeCursorAppId(c) {
  if (!c) return null;
  try {
    const p = JSON.parse(Buffer.from(c, "base64").toString("utf8"));
    if (Array.isArray(p) && typeof p[2] === "string") return p[2]; // keyset tuple
  } catch {
    /* not a tuple */
  }
  return c; // legacy bare id
}

async function main() {
  for (const q of QUERIES) {
    console.log(`### ${q}`);
    let cursor = null;
    for (let pg = 1; pg <= PAGES; pg++) {
      const url = `${BASE}/api/v1/apps?limit=50&${q}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(url);
      const body = await res.json();
      const ids = (body.data || []).map((x) => x.id).join(",");
      const nc = body.pagination?.nextCursor ?? null;
      console.log(`p${pg} total=${body.pagination?.totalCount} cursorAppId=${decodeCursorAppId(nc)}`);
      console.log(ids);
      if (!nc) break;
      cursor = nc;
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
