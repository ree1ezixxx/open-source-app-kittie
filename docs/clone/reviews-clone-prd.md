# Reviews Clone — Parity Audit & PRD

**Source of truth:** `https://www.appkittie.com/dashboard/reviews/*` (live, logged-in).
**Target:** our clone `apps/web/src/pages/reviews/` on `localhost:5173`.
**Date:** 2026-06-17 · **Walkthrough:** live on isolated Chrome :9223, account logged in, monitored app = Duolingo (1,399 reviews, 3.8★).
**Truth evidence:** `coordinator/.cache/reviews-truth/findings.md` + screenshots (`overview.png`, `overview-single-app.png`, `feed-top.png`, `semantics-top.png`, `semantics-timeline-table.png`, `improvements-top.png`).

**Current parity: ~54/100 (≈3/5).** Below the project's 4/5 gate. Real structure exists on all four tabs, but the headline **single-app Overview dashboard** and the **app-selector pattern** are the big misses. This PRD sequences the work to reach ≥4/5.

---

## 1. Scope

Clone all four Reviews surfaces view-by-view to behavioural + visual parity with the live site:
`/overview` · `/feed` · `/semantics` · `/improvements`, plus the shared shell (app-selector, add-app flow, how-it-works, refresh, theme). Desktop 1440px, dark theme, logged-in.

Out of scope (external blockers — see §8): real LLM-generated AI summaries and the email/Slack alerts backend. We build the UI + wire to our data; AI-summary text and alert delivery are stubbed/flagged until the models/backend land.

---

## 2. Reference map (truth) — condensed

Full detail in `findings.md`. Key structure:

- **Shell:** left global nav → header (chat icon + "Reviews" h1 + subtitle) → "How review monitoring works" lime info-pill (4 bullets) → tab nav (Overview/Reviews/Semantics/Improvements; Reviews tab routes to **`/feed`**) → **app-selector dropdown**.
- **App selector:** top **"All Apps {N}"** 420px dropdown. Rows: *All Apps* (aggregate, check when selected) · per-app row (icon + name + "{count} reviews · {rating}" + **refresh** + **trash** icon buttons) · **Add App** footer. Single-app mode adds a header **Refresh** button. **Feed/Semantics/Improvements are single-app only** (no All-Apps); Overview defaults to All-Apps aggregate.
- **Overview — aggregate:** 3 KPI cards (Total Reviews / Average Rating / Apps Monitored) + **"Your Apps"** grid (per-app cards).
- **Overview — single-app (the rich dashboard):** Review-alerts card (email/Slack) → Rating card + distribution bars (5–1★ counts) → Reviews card (%pos/%neg) → **AI Summary** (prose + TOP TOPICS chips + What Users Love / What Needs Work + compared-to-previous-period) → **Feedback Insights** (satisfaction % + topic-frequency bars + "View All Reviews" → /feed).
- **Feed:** Review Growth chart (New/Total toggle + period chips All/7/14/30/90/180d) → search box → rating seg (All/5–1★) → sentiment seg (**All/Positive/Negative/Neutral/Mixed**) → TOPICS facet (+N more) → IMPROVEMENTS facet (+N more) → **3-column card grid** (gold stars + sentiment badge + title + body + tag chips + author-initial + date) → pagination ("Showing 1–20 of N", prev/next, **20/page**). **Filters persist to URL querystring** (`?sentiment=negative` → 1399→467, verified).
- **Semantics:** Topic Trends multi-series area chart + toggleable topic legend + **Hide All** → **Topic Timeline** table (Topic | Sentiment | Rating | Total | **per-date columns** May 23…Jun 16) → period chips.
- **Improvements:** Improvement Trends stacked-area chart → **All/Needs Work/Strengths** filter → **Improvement Areas** 3-col card grid (name + severity dot + ★rating + "{n} mentions ({%})" + bar), each **links to `/feed?improvementArea=<Name>`**.
- **Add flow:** dropdown → Add App → panel with **Search | Paste URL** tabs. Search = live results (icon + name + "Developer · Category" + rating). Paste URL = `type=url` "Paste an app URL" (Apple App Store / Google Play). → **"Add this app?"** confirm (icon/dev/category/rating/**total review count**) → **5-stage sync modal** (Validating URL → Fetching App Info → Extracting Reviews live X/500 → Analyzing → Preparing Dashboard) with **% bar + Cancel + Minimize-to-background**.
- **Design tokens:** **Space Grotesk** (UI) + **JetBrains Mono** (numbers). Lime `#4d7c0f`, vivid accent `#c8ff00`. Charts teal `#00d3cb`/coral `#ff8566`/pink `#f45fb0`. Cards: 2% white fill, `1px rgba(255,255,255,.08)` border, **radius 16px**, padding 20px.

---

## 3. Target map (clone) — condensed

- **Page:** `ReviewsPage.tsx` — tab via `useParams :tab`, app via `?app=` query (incl. `__all__`). `PageHeader → HowItWorks → 2-pane rv-layout (left rv-rail apps list + right rv-content) → Tabs → panel`.
- **State/data:** monitored apps in **localStorage** (`kittie.reviews.monitored.v1`); no auth/user backend. `POST /api/v1/reviews` (limit 500) + `GET /reviews/counts`. Sentiment/topics/improvements/time-series all **computed client-side** in `reviewIntel.ts` from an interim keyword classifier (LLM swap-seam), preferring server tags when present.
- **Backend:** `packages/api/src/routes/reviews.ts` = only `/counts` + `POST /`. Sync = `/apps/:id/sync-reviews` + `/stream` SSE elsewhere. No backend for sentiment/semantics/improvements/AI-summary/alerts.

---

## 4. Parity matrix

| # | Surface | Status | Gap | Severity |
|---|---------|--------|-----|----------|
| 1 | Tab routes | PARTIAL | Reviews tab = `/reviews/reviews` not `/feed`; drill-through → `/reviews/reviews?area=` not `/feed?improvementArea=` | High (IA/URL) |
| 2 | App selector | PARTIAL (wrong pattern) | Left **rail**, not top **"All Apps {N}" dropdown**; no per-row refresh, no "{count} reviews · {rating}", no Add-App-with-confirm | High |
| 3 | Overview aggregate | PARTIAL | KPI cards ok (3/3) but **no "Your Apps" grid**; aggregate renders same cards as single-app | Medium |
| 4 | **Overview single-app (rich)** | **MISSING** | No Review-alerts, no **AI Summary**, no **Feedback Insights**; only rating-dist + sentiment cards; single-app == aggregate | **Critical** |
| 5 | Feed | PARTIAL | **No Review Growth chart**, **no pagination**, cards are a **list not 3-col grid**, sentiment **3-way not 5-way** (no Neutral), facets have no "+N more", **filters not in URL**, extra Sort select truth lacks | High |
| 6 | Semantics | PARTIAL | Topic Timeline uses a **sparkline, not the per-date column matrix**; no **Hide All**; carries a MockNotice banner truth lacks | Medium |
| 7 | Improvements | PARTIAL | Structurally close (trends + filter + card grid + drill-through), but drill-through route wrong (#1); severity binary, no emoji | Low–Medium |
| 8 | Add-app flow | PARTIAL | No **Search/Paste-URL tabs**, no **"Add this app?" confirm**, sync modal **4 stages not 5**, no **Cancel + Minimize** | High |
| 9 | How-it-works / Refresh | PARTIAL | How-it-works copy matches but plain button (not lime pill); **Refresh misplaced** (in period rows on Semantics/Improv; truth = header on single-app Overview + Feed) | Medium |
| 10 | Design tokens | DIVERGENT | accent `#c6f24d` not lime `#4d7c0f`/`#c8ff00`; UI font Inter/SF not **Space Grotesk**; **no JetBrains Mono**; card radius **13px not 16px** | High (visual) |

---

## 5. Highest-leverage gaps & root causes

1. **Single-app rich Overview missing** (Critical). Root cause: clone never built a distinct single-app view — aggregate and single-app share one render; and there's no AI-summary/alerts data model. Needs new components + data (AI summary, feedback insights) + alerts UI.
2. **App selector is a rail, not a dropdown** (High). Root cause: different IA decision early on. Pattern swap, not just styling.
3. **Feed structural deltas** (High): missing Review-Growth chart, list-not-grid, no pagination, filters not URL-synced. Root cause: simpler MVP feed; data is already client-side so most are mechanical.
4. **Add-flow incomplete** (High): no Paste-URL/confirm/minimize, 4 vs 5 stages. Root cause: built against our own app DB, not a store-URL ingest with confirm.
5. **Design tokens diverge** (High, visual): font + lime + radius. Root cause: clone uses the global app shell tokens, not appkittie's. Touches global CSS, not just reviews.

---

## 6. Patch plan (sequenced)

Each patch = one focused commit. P0 first (cheap, high URL/visual parity), then structural.

### P0 — Cheap parity wins (mechanical)
- **P0.1 Routes:** rename Reviews tab id `reviews`→`feed`; redirect `/reviews/reviews`→`/reviews/feed`; fix drill-through to `/reviews/feed?improvementArea=<Name>` (URL-encoded). *Accept:* all four tab URLs match truth paths; Improvements cards deep-link to feed filtered by area.
- **P0.2 Design tokens (reviews scope):** apply Space Grotesk (UI) + JetBrains Mono (numeric) within reviews; set accent to lime `#4d7c0f` + vivid `#c8ff00`; card radius 16px. *Accept:* side-by-side cards/typography indistinguishable from truth screenshots. *(Note: global-shell font/accent is a separate decision — see §9.)*
- **P0.3 Sentiment 5-way:** add Neutral to the segmented control + classifier buckets (type already supports it). *Accept:* All/Positive/Negative/Neutral/Mixed present and filter correctly.
- **P0.4 Facet "+N more":** collapse TOPICS/IMPROVEMENTS chips to truth's count + expander. *Accept:* matches truth chip set + "+N more" expand.
- **P0.5 Filters → URL:** sync rating/sentiment/search/period to querystring. *Accept:* `?sentiment=negative` etc. reload-safe and shareable.

### P1 — Feed structural parity
- **P1.1 Card grid:** convert review list → 3-column grid; card = gold stars (top-left) + sentiment badge (top-right) + title + body + tag chips + author-initial avatar + date. *Accept:* visual match to `feed-top.png`.
- **P1.2 Pagination:** "Showing 1–20 of N" + prev/next, 20/page. *Accept:* matches truth paging.
- **P1.3 Review Growth chart:** New/Total toggle + period chips; empty state "No historical review metrics yet" until snapshots exist. *Accept:* renders chart or the empty copy.
- **P1.4** Remove the extra Sort select (truth has none) unless we justify keeping it.

### P2 — App selector → dropdown + Refresh
- **P2.1** Replace left rail with top **"All Apps {N}"** 420px dropdown: All-Apps row (check when selected) + per-app rows (icon + name + "{count} reviews · {rating}" + refresh + trash) + Add-App footer. *Accept:* matches `app-selector-dropdown.png`; All-Apps restricted to Overview.
- **P2.2** Header **Refresh** button in single-app mode (Overview + Feed); remove from period rows. *Accept:* placement matches truth.

### P3 — Single-app rich Overview (the big one)
- **P3.1** Rating card + distribution bars (5–1★ counts, color-graded) and Reviews card (%pos/%neg). *Accept:* matches `overview-single-app.png` top.
- **P3.2** Feedback Insights card (satisfaction % + topic-frequency bars + "View All Reviews"→/feed). *Accept:* structure + drill-through.
- **P3.3** AI Summary card (summary prose + TOP TOPICS chips + What Users Love / Needs Work + compared-to-previous-period). *Data:* wire to real LLM when available; until then label as modelled/interim (Honest-Data rule). *Accept:* layout matches; copy clearly sourced.
- **P3.4** Review-alerts card (email/Slack UI + empty state). *Backend blocker* — UI now, delivery later (§8).
- **P3.5** "Your Apps" grid for aggregate Overview. *Accept:* per-app cards match aggregate `overview.png`.

### P4 — Add-app flow
- **P4.1** Search | Paste-URL mode tabs; result rows show "Developer · Category" + rating. **P4.2** "Add this app?" confirm step (icon/dev/category/rating/total count → Yes/Cancel). **P4.3** Sync modal → 5 stages + % bar + **Cancel** + **Minimize-to-background**. *Accept:* flow matches truth screens.

### P5 — Semantics polish
- **P5.1** Topic Timeline per-date column matrix (Topic|Sentiment|Rating|Total|dates). **P5.2** "Hide All" legend control. **P5.3** Drop the MockNotice banner (or gate behind interim-classifier only). *Accept:* matches `semantics-timeline-table.png`.

---

## 7. Re-test checklist (per patch, live side-by-side on :9223 vs :5173)

- All four tab URLs resolve to truth-matching paths; drill-through lands on filtered feed.
- Cards/typography/lime/radius indistinguishable from truth screenshots at 1440px dark.
- Feed: grid layout, pagination 20/page, filters reload-safe in URL, 5-way sentiment, Review-Growth empty/populated.
- Selector dropdown matches; Refresh in header for single-app Overview+Feed only.
- Single-app Overview renders all 5 blocks; aggregate shows Your-Apps grid.
- Add flow: Search+Paste tabs, confirm dialog, 5-stage sync + Cancel + Minimize.
- No console errors; loading/empty/error states per tab.
- **Score each surface /5; do not hand back any surface <4** (project gate).

---

## 8. External blockers (honest)

- **AI Summary text** needs a real LLM pass over reviews. Until wired, render layout with interim/modelled copy clearly labelled (never present as ground truth).
- **Email/Slack alerts** need an alerts backend + delivery integration. Build the UI + empty state now; delivery is deferred.
- **Review Growth + Topic Timeline history** need accumulated daily snapshots; until then show truth's "No historical review metrics yet" empty state honestly.

These are the only sanctioned reasons a given sub-surface may sit <4 — flagged, not papered over.

---

## 9. Open decisions for Rhodri (resolve before/early in execution)

1. **Design tokens scope** — reskin reviews only, or change the **global app shell** to Space Grotesk + lime (affects every page)? Truth uses it app-wide.
2. **App-selection persistence** — truth resets selection per tab; ours persists via `?app=` (arguably better UX). Match truth exactly, or keep ours?
3. **All-Apps scoping** — truth restricts All-Apps to Overview only (Feed/Semantics/Improvements are single-app). Match, or keep our broader All-Apps?
4. **AI Summary / alerts** — confirm the LLM + alerts backend are out of v1 scope (build UI, defer data), per §8.
