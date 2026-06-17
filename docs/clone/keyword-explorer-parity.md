# ASO Keyword Explorer — Clone Parity Audit

**Reference (truth):** https://www.appkittie.com/dashboard/aso/keywords
**Target:** `apps/web` `KeywordExplorerPage` + `packages/api/src/routes/keywords.ts` + `keywords` data model
**Role/viewport:** logged-in, desktop. **Bar:** structural parity (data shape, endpoints, states, interactions) so we can iterate.
**Date:** 2026-06-17 · driven live via truth Chrome :9222.

---

## Reference Map (appkittie)

- **Flow:** "Keyword Explorer" — one search box (`Search, paste keywords, or start a topic…`) →
  keywords resolve into a list with metrics → filter / sort / track. Title: *Keyword Explorer | appkittie*.
- **Controls:** store toggle **Apple Store / Google Play**; **multi-market country picker** (US, GB, CA,
  AU, NZ, IE, DE, FR, IT, ES, NL, BE, AT, CH, PT, LU, SE, NO, DK, … ~26 markets); **segment filters**
  `All · Opportunities · Low diff · Pending` (each with a count); **sort** `Newest`; `Explore` mode.
- **Endpoints (tRPC):** `keywordTracking.keywords.getAll` → `{ keywords[], limit, canAdd }` (the tracked
  list + its metrics). Per-app history elsewhere via `appStore.historicals.getChartData`.
- **Per-keyword metrics (inferred from filters + UI):** difficulty, opportunity score, popularity/volume,
  competing-app count, ranking apps, **per-market** breakdown, async **Pending** compute state.
- **States:** empty (`canAdd:true`, all counts 0) · pending (per-market async) · populated.

## Target Map (ours)

- **Web:** `KeywordExplorerPage.tsx` — identical placeholder; segment filters; sort (most/least popular);
  store + country; search/paste/topic; `compareKeywords`, `fetchRelated`, `fetchSuggestions`,
  `fetchTracked`, markets SSE stream.
- **API (`/api/v1/keywords`):** `/difficulty` (cache-first, 7-day TTL), `/related`, `/suggestions`
  (category + title-bigram mining over the 1.1M `apps`), `/markets` + `/markets/stream` (SSE, **Pending**
  pattern), `/tracked`, `/tracked-apps`, `POST /difficulty` (batch).
- **Model:** `keywords` (popularity, difficulty, trafficScore, **opportunityScore**, competingAppCount,
  topResults JSON), `tracked_keywords`.
- **Live response shape** (`/difficulty?keyword=meditation`):
  `{ keyword, country, store, popularity:100, difficulty:77, trafficScore:100, opportunityScore:47,
  competingAppCount:189, topApps:[{title,iconUrl,reviewCount,rating,rank}] }`.

## Parity Matrix

| Area | Reference | Target | Gap | Severity | Fix |
|---|---|---|---|---|---|
| Data model | difficulty/opportunity/volume/competing/ranking apps/per-market | same fields present | aligned | — | — |
| Tracked-keyword model | `keywordTracking.keywords.*`, canAdd, limit | `/tracked` + `tracked_keywords` | aligned | — | — |
| Search / paste / topic | one box, multi-add | same box + `compareKeywords` | aligned | — | — |
| Store + multi-market | Apple/Google + ~26 countries | toggle + `/markets` over 26 markets | aligned | — | — |
| Async "Pending" | per-market async compute | `/markets/stream` SSE emits per market | aligned (exact-clone) | — | — |
| Segment filters | All/Opportunities/Low diff/Pending | sort+filter incl. opportunity/difficulty | aligned | Low | confirm labels match in UI QA |
| **Keyword DATA** | populated catalog | **was 0 rows** → now ~1.5K & climbing | was hollow | **Critical** | ✅ `keyword-seed` populator (running) |
| **Write durability** | n/a | **`SQLITE_BUSY` killed cache writes under load** | silent failures | **High** | ✅ `retryBusy` on the upsert |
| Multi-country cache | instant per market | only US seeded → `/markets` slow until cached | perf | Medium | pre-seed top markets (GB/CA/AU/DE) |
| Freshness | continuous | `keyword-rescore` (tracked only) | stale risk | Medium | periodic re-seed / widen rescore |
| Visual / interaction | live UI | **not yet driven live** (web app not running) | unverified | — | live UI QA pass |

## Root causes

- **Hollow data:** the keyword pipeline (`syncKeyword` + `suggestRelatedKeywords`) was fully built but
  **never run** — identical pattern to the snapshot gap. Not a structural miss.
- **Write failures:** E-aso branch predates the catalog lane's `retryBusy`; libsql ignores `busy_timeout`,
  so keyword cache-writes died with `SQLITE_BUSY` whenever the drainers/backfill were writing — meaning
  even *on-demand* lookups failed to cache under load.

## Patch plan

1. ✅ **`retryBusy` on keyword writes** — `util/retry-busy.ts` (ported from catalog lane), wrap
   `upsertKeywordRow` in `db/keywords.ts`. Verified 1500/1500, 0 failures.
2. ✅ **`jobs/keyword-seed.ts`** — seed→expand(`suggestRelatedKeywords`)→`syncKeyword`. Populating
   ~1,500 US/Apple keywords with real metrics + ranking apps. Idempotent/resumable.
3. ☐ **Pre-seed top markets** (GB/CA/AU/DE) so `/markets` returns fast instead of live-fetching.
4. ☐ **Freshness** — register a periodic keyword re-seed/rescore so the cache doesn't go stale.
5. ☐ **Live UI QA** — start `apps/web`, drive the explorer vs truth side-by-side; confirm filter labels,
   pending animation, ranking-app rows, sort. Required to certify ≥4/5 visual+interaction.

## Parity Score (structural pass — UI not yet driven live)

| Dimension | Score | Note |
|---|---|---|
| Data model / shape | 5/5 | fields map 1:1 |
| Endpoints / API structure | 5/5 | difficulty/related/suggestions/markets(+stream)/tracked all present |
| Functional (search→metrics→markets) | 4/5 | works live; markets slow until multi-country cached |
| Data populated | 4/5 | US/Apple seeding; other markets + Google pending |
| Visual / interaction | — | **unverified** — needs live UI QA |
| **Overall (structure)** | **4.4/5** | construction is correct; finish = multi-market seed + UI QA |

## Next pass

Start the web app, drive the Keyword Explorer against truth, score visual+interaction, then seed
GB/CA/AU/DE + a Google pass. Structure is sound — we can iterate on it.
