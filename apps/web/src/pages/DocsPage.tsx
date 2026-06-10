/* ============================================================
   API Docs. /docs
   Self-contained single-page reference for the Kittie REST API
   (the live product links out to a Mintlify portal; we ship this
   instead). Endpoints below mirror packages/api/src/routes/* —
   apps, keywords, reviews — mounted at /api/v1 in app.ts.
   ============================================================ */
import type { CSSProperties, ReactNode } from "react";
import type { Theme } from "../lib/theme";
import { PageHeader } from "../components/reviews/primitives";
import { IconBook, IconSun, IconMoon } from "../icons";

/* ---- shared inline styles (page is self-contained; no new CSS files) ---- */
const mono: CSSProperties = {
  fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, monospace',
};

const codeBlock: CSSProperties = {
  ...mono,
  display: "block",
  margin: 0,
  padding: "12px 14px",
  fontSize: 12,
  lineHeight: 1.65,
  color: "var(--text-secondary)",
  background: "var(--surface)",
  border: "1px solid var(--border-soft)",
  borderRadius: 10,
  overflowX: "auto",
  whiteSpace: "pre",
};

const METHOD_COLORS: Record<string, string> = {
  GET: "var(--accent)",
  POST: "var(--positive)",
  DELETE: "var(--negative)",
};

function MethodPill({ method }: { method: string }) {
  const color = METHOD_COLORS[method] ?? "var(--text-secondary)";
  return (
    <span
      style={{
        ...mono, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
        color, background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
        padding: "2px 8px", borderRadius: 6, flexShrink: 0,
      }}
    >
      {method}
    </span>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 40, scrollMarginTop: 16 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 4px" }}>{title}</h2>
      {sub && <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "0 0 14px" }}>{sub}</p>}
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--text-secondary)", margin: "0 0 12px" }}>{children}</p>;
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code
      style={{
        ...mono, fontSize: 11.5, color: "var(--text)",
        background: "var(--surface-2)", border: "1px solid var(--border-soft)",
        borderRadius: 5, padding: "1px 5px", whiteSpace: "nowrap",
      }}
    >
      {children}
    </code>
  );
}

interface EndpointDef {
  method: "GET" | "POST" | "DELETE";
  path: string;
  desc: string;
  params?: { name: string; desc: string }[];
  example: string;
}

function Endpoint({ ep }: { ep: EndpointDef }) {
  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border-soft)",
        borderRadius: 13, padding: 16, marginBottom: 12, scrollMarginTop: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
        <MethodPill method={ep.method} />
        <code style={{ ...mono, fontSize: 13, fontWeight: 650, color: "var(--text)" }}>{ep.path}</code>
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text-secondary)", margin: "0 0 12px" }}>{ep.desc}</p>
      {ep.params && ep.params.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {ep.params.map((p) => (
            <div key={p.name} style={{ display: "flex", gap: 10, padding: "5px 0", fontSize: 12, borderTop: "1px solid var(--border-soft)" }}>
              <code style={{ ...mono, fontSize: 11.5, color: "var(--accent)", minWidth: 128, flexShrink: 0 }}>{p.name}</code>
              <span style={{ color: "var(--text-tertiary)", lineHeight: 1.5 }}>{p.desc}</span>
            </div>
          ))}
        </div>
      )}
      <pre style={{ ...codeBlock, background: "var(--surface-2)", fontSize: 11.5 }}>{ep.example}</pre>
    </div>
  );
}

/* ---- Reference data: one block per real route in packages/api ---- */
const APPS_ENDPOINTS: EndpointDef[] = [
  {
    method: "GET",
    path: "/api/v1/apps",
    desc: "Search & filter the app database. Powers Explore, Highlights and Rising. Cursor-paginated.",
    params: [
      { name: "search", desc: "Free-text match on title / developer." },
      { name: "source", desc: "apple | google." },
      { name: "categories", desc: "Comma-separated category names (excludedCategories also supported)." },
      { name: "sortBy", desc: "revenue | downloads | rating | reviews | growth | trending | newest | released | updated." },
      { name: "sortOrder", desc: "asc | desc." },
      { name: "priceType", desc: "all | free | paid (plus minPrice / maxPrice)." },
      { name: "minRating …", desc: "Range filters: min/max for rating, reviews, downloads, revenue, growth." },
      { name: "limit", desc: "Page size, 1–100." },
      { name: "cursor", desc: "Opaque cursor from the previous page." },
    ],
    example: `{
  "data": [
    {
      "id": "app_2f9c…", "store": "apple", "title": "CalAI",
      "developer": "Viral Apps Inc", "category": "Health & Fitness",
      "rating": 4.7, "reviewCount": 18234,
      "downloadsEstimate30d": 410000, "revenueEstimate30d": 620000,
      "growthScore": null, "releasedAt": "2024-05-02", …
    }, …
  ],
  "pagination": { "nextCursor": "eyJvZmZzZXQiOjUwfQ", "totalCount": 283 }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/apps/:id",
    desc: "Full detail for one app — description, screenshots, IAPs, ads, creators, historicals. 404 if unknown.",
    example: `{
  "data": {
    "id": "app_2f9c…", "title": "CalAI", "description": "Track calories…",
    "screenshotUrls": ["https://…/s1.png", …], "price": 0,
    "languages": ["EN", "ES"], "iaps": [...], "historicals": [...], …
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/apps/:id/historicals",
    desc: "Daily snapshot series for the detail charts (rating, reviews, downloads, revenue). One point per ingested day.",
    example: `{
  "data": [
    { "date": "2026-06-07", "rating": 4.7, "reviewCount": 18234,
      "downloadsEstimate": 410000, "revenueEstimate": 620000, … }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/v1/apps/:id/sync-reviews",
    desc: "Pull fresh reviews from the store for one app (the Refresh button). Fire-and-wait; returns once the sync completes.",
    example: `{ "data": { "fetched": 220, "inserted": 38, "total": 538 } }`,
  },
  {
    method: "GET",
    path: "/api/v1/apps/:id/sync-reviews/stream",
    desc: "Same sync as above, streamed over SSE for the 5-stage monitoring modal. Events: start → fetch → analyse → save → done (or failed / error). Each event is tied to a real step, not a timer.",
    example: `event: start
data: {"stage":"start"}

event: fetch
data: {"fetched":200}

event: done
data: {"fetched":220,"inserted":38,"total":538}`,
  },
];

const KEYWORDS_ENDPOINTS: EndpointDef[] = [
  {
    method: "GET",
    path: "/api/v1/keywords/tracked",
    desc: "The durable tracked-keyword shortlist (survives reload).",
    example: `{ "data": [ { "keyword": "calorie tracker", "country": "US", "store": "apple" } ],
  "meta": { "source": "tracked-shortlist", "count": 1 } }`,
  },
  {
    method: "POST",
    path: "/api/v1/keywords/tracked",
    desc: "Add a keyword to the shortlist. JSON body.",
    params: [
      { name: "keyword", desc: "Required. The keyword to track." },
      { name: "country", desc: "ISO country, default US." },
      { name: "store", desc: "apple (default) | google." },
    ],
    example: `{ "data": { "keyword": "calorie tracker", "country": "US", "store": "apple" },
  "meta": { "source": "tracked-shortlist" } }`,
  },
  {
    method: "DELETE",
    path: "/api/v1/keywords/tracked",
    desc: "Remove a keyword from the shortlist. Query params: keyword (required), country, store.",
    example: `{ "data": { "removed": true }, "meta": { "source": "tracked-shortlist" } }`,
  },
  {
    method: "GET",
    path: "/api/v1/keywords/suggestions",
    desc: "Keyword suggestion chips derived from your tracked apps.",
    params: [
      { name: "store", desc: "apple | google (optional)." },
      { name: "limit", desc: "Max 50, default 20." },
    ],
    example: `{ "data": ["calorie tracker", "macro counter", …],
  "meta": { "country": "US", "appCount": 12, "source": "tracked-apps" } }`,
  },
  {
    method: "GET",
    path: "/api/v1/keywords/difficulty",
    desc: "Difficulty + traffic score for a single keyword, from a live store search.",
    params: [
      { name: "keyword", desc: "Required." },
      { name: "country", desc: "Default US." },
      { name: "store", desc: "apple (default) | google." },
      { name: "refresh", desc: "true | 1 to bypass the cache." },
    ],
    example: `{ "data": { "keyword": "calorie tracker", "difficulty": 62, "traffic": 71,
    "topApps": [ { "title": "CalAI", "rank": 1, … }, … ] },
  "meta": { "source": "store-search", "refreshed": false } }`,
  },
  {
    method: "POST",
    path: "/api/v1/keywords/difficulty",
    desc: "Batch difficulty for up to 25 keywords in one call (the opportunity-sort table). Body: { keywords: [{ keyword, country?, store? }] }.",
    example: `{ "data": [ { "keyword": "calorie tracker", "difficulty": 62, … }, … ],
  "meta": { "source": "store-search" } }`,
  },
  {
    method: "GET",
    path: "/api/v1/keywords/related",
    desc: "Related keyword ideas for a seed, from store autocomplete (client scores them via the batch endpoint).",
    params: [
      { name: "keyword", desc: "Required seed keyword." },
      { name: "limit", desc: "Max 30, default 20." },
    ],
    example: `{ "data": ["calorie counter app", "food log", …],
  "meta": { "source": "store-autocomplete", "seed": "calorie tracker" } }`,
  },
  {
    method: "GET",
    path: "/api/v1/keywords/markets",
    desc: "Cross-market metrics for one keyword — the opportunity finder behind row-expand. Up to 16 markets per call.",
    params: [
      { name: "keyword", desc: "Required." },
      { name: "countries", desc: "Comma-separated ISO codes; defaults to all supported markets." },
    ],
    example: `{ "data": [ { "country": "US", "difficulty": 62, "traffic": 71 },
    { "country": "DE", "difficulty": 38, "traffic": 44 }, … ],
  "meta": { "source": "store-search", "keyword": "calorie tracker" } }`,
  },
];

const REVIEWS_ENDPOINTS: EndpointDef[] = [
  {
    method: "GET",
    path: "/api/v1/reviews/counts",
    desc: "Indexed review counts per app (?ids=a,b,c) — the rail's real coverage number, not the store's listing total.",
    example: `{ "data": { "app_2f9c…": 538, "app_81aa…": 1204 } }`,
  },
  {
    method: "POST",
    path: "/api/v1/reviews",
    desc: "Review text + metadata for one app from the local cache. Body: { appId, country?, limit? } — limit 1–500, default 20.",
    example: `{
  "data": [
    { "id": "rev_77…", "rating": 5, "title": "Love it",
      "body": "Best tracker I've used…", "country": "US", "date": "2026-06-01" }, …
  ],
  "meta": { "source": "cache", "stale": false }
}`,
  },
];

const MISC_ENDPOINTS: EndpointDef[] = [
  {
    method: "GET",
    path: "/health",
    desc: "Liveness probe (note: not under /api/v1).",
    example: `{ "ok": true }`,
  },
  {
    method: "GET",
    path: "/api/v1/countries",
    desc: "Supported country codes for filters and keyword markets.",
    example: `{ "data": ["US", "GB", "DE", "FR", "JP", …] }`,
  },
];

const NAV = [
  { id: "introduction", label: "Introduction" },
  { id: "quickstart", label: "Quickstart" },
  { id: "authentication", label: "Authentication" },
  { id: "credits", label: "Credits & rate limits" },
  { id: "errors", label: "Errors" },
  { id: "ref-apps", label: "Reference — Apps" },
  { id: "ref-keywords", label: "Reference — Keywords" },
  { id: "ref-reviews", label: "Reference — Reviews" },
  { id: "ref-misc", label: "Reference — Misc" },
];

export function DocsPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <main className="main">
      <PageHeader
        icon={<IconBook style={{ width: 18, height: 18 }} />}
        title="API Docs"
        subtitle="Kittie REST API — reference & quickstart"
        actions={
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        }
      />

      <div className="set-scroll">
        <div
          style={{
            maxWidth: 1020, margin: "0 auto", padding: "26px 24px 90px",
            display: "grid", gridTemplateColumns: "168px minmax(0, 1fr)",
            gap: 36, alignItems: "start",
          }}
        >
          {/* ---- in-page nav ---- */}
          <nav aria-label="On this page" style={{ position: "sticky", top: 18 }}>
            <div
              style={{
                fontSize: 10.5, fontWeight: 650, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--text-faint)", marginBottom: 10,
              }}
            >
              On this page
            </div>
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                style={{
                  display: "block", padding: "5px 0", fontSize: 12.5,
                  color: "var(--text-tertiary)", textDecoration: "none",
                  borderLeft: "2px solid var(--border-soft)", paddingLeft: 11,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderLeftColor = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.borderLeftColor = "var(--border-soft)"; }}
              >
                {n.label}
              </a>
            ))}
          </nav>

          {/* ---- content ---- */}
          <div>
            <Section id="introduction" title="Introduction">
              <P>
                The Kittie API exposes the same app-intelligence data the dashboard runs on:
                a searchable app database with revenue & download estimates, keyword difficulty
                scored from live store searches, and full review text for sentiment work.
                It's a plain REST API returning JSON.
              </P>
              <P>
                All endpoints live under the base URL <InlineCode>/api/v1</InlineCode>. In
                development the web app proxies <InlineCode>/api</InlineCode> to the API server
                on port 3007, so you can hit it directly at{" "}
                <InlineCode>http://localhost:3007/api/v1</InlineCode> or through the Vite dev
                server. Success responses wrap payloads as{" "}
                <InlineCode>{`{ "data": … }`}</InlineCode>, usually with a{" "}
                <InlineCode>meta</InlineCode> block describing the source; list endpoints add{" "}
                <InlineCode>pagination</InlineCode>.
              </P>
            </Section>

            <Section id="quickstart" title="Quickstart" sub="Three top apps by revenue, in one curl.">
              <div className="mcp-term" style={{ maxWidth: "none", boxShadow: "none", marginBottom: 12 }}>
                <div className="mcp-term-bar">
                  <span className="mcp-dot" /><span className="mcp-dot" /><span className="mcp-dot" />
                  <span className="mcp-term-label">terminal</span>
                </div>
                <pre className="mcp-term-body">
                  <code>
                    <span className="mcp-prompt">$ </span>
                    {`curl "http://localhost:3007/api/v1/apps?limit=3&sortBy=revenue&sortOrder=desc"`}
                  </code>
                </pre>
              </div>
              <P>
                You'll get a <InlineCode>data</InlineCode> array of app objects plus a{" "}
                <InlineCode>pagination</InlineCode> block — pass{" "}
                <InlineCode>pagination.nextCursor</InlineCode> back as{" "}
                <InlineCode>cursor</InlineCode> to fetch the next page. If the local database is
                empty the API serves a small mock dataset so every endpoint stays explorable.
              </P>
            </Section>

            <Section id="authentication" title="Authentication">
              <P>
                <strong style={{ color: "var(--text)", fontWeight: 620 }}>The local API is open</strong> —
                no key required, every request is accepted. Bearer-key auth is the planned scheme:
                create a key on the API Keys page and send it as a header. The header is parsed
                but not enforced in this open-source build.
              </P>
              <pre style={codeBlock}>{`Authorization: Bearer kit_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`}</pre>
            </Section>

            <Section id="credits" title="Credits & rate limits">
              <P>
                Plans include <strong style={{ color: "var(--text)", fontWeight: 620 }}>25,000 credits per month</strong>;
                one request consumes one credit, and batch keyword difficulty consumes one credit
                per keyword scored. Credits reset on the 1st and don't roll over. In this build
                nothing is metered or rate-limited — the allowance is documented for parity with
                the hosted product. Endpoints that hit live app stores (keyword difficulty,
                review sync) are internally paced instead.
              </P>
            </Section>

            <Section id="errors" title="Errors" sub="Plain JSON, conventional status codes.">
              <P>
                Errors return a non-2xx status with an <InlineCode>error</InlineCode> field.
                Missing resources are <InlineCode>404</InlineCode>; a missing or invalid
                parameter is <InlineCode>400</InlineCode> with either a message string or a
                field-level validation object.
              </P>
              <pre style={codeBlock}>{`// 404 — unknown resource
{ "error": "App not found" }

// 400 — missing required query param
{ "error": "keyword is required" }

// 400 — body validation (zod flatten shape)
{ "error": { "formErrors": [], "fieldErrors": { "keywords": ["Array must contain at most 25 element(s)"] } } }`}</pre>
            </Section>

            <Section id="ref-apps" title="Reference — Apps" sub="The app database: search, detail, historicals, review sync.">
              {APPS_ENDPOINTS.map((ep) => <Endpoint key={ep.method + ep.path} ep={ep} />)}
            </Section>

            <Section id="ref-keywords" title="Reference — Keywords" sub="ASO: difficulty, suggestions, related terms, cross-market scores, tracked shortlist.">
              {KEYWORDS_ENDPOINTS.map((ep) => <Endpoint key={ep.method + ep.path} ep={ep} />)}
            </Section>

            <Section id="ref-reviews" title="Reference — Reviews" sub="Cached review text and per-app coverage counts.">
              {REVIEWS_ENDPOINTS.map((ep) => <Endpoint key={ep.method + ep.path} ep={ep} />)}
            </Section>

            <Section id="ref-misc" title="Reference — Misc">
              {MISC_ENDPOINTS.map((ep) => <Endpoint key={ep.method + ep.path} ep={ep} />)}
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}
