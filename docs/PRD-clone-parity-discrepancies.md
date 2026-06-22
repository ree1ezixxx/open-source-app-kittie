# PRD — AppKittie Clone Parity: Closing the Discrepancies

**Owner:** clone-parity `/goal` loop
**Truth:** `https://www.appkittie.com` (live)  ·  **Clone:** `http://127.0.0.1:5173` (`@kittie/web`), API `:3008`
**Gate:** every surface scored **/5**, hard **≥4** to ship. Truth wins on conflict. Never fabricate data — honest empty-states only.
**Only intentional divergence:** the "Kittie" brand (wordmark/logo). Everything else — IA, layout, behaviour, data shape, visuals — is in scope.

---

## 0. Why this PRD leads with a re-baseline (read first)

The `2026-06-22` parity-audit handoff is a useful map but is **partially stale** — proven this session by live re-check:

| Surface | Handoff said | Live reality now |
|---|---|---|
| Pricing Calculator | "WRONG TOOL — revenue estimator · **1.0**" | **Already the PPP localizer** — same h1, 244-country table, Add Price, Copy/Export JSON. ~4–4.5/5. |
| Explore | "card-rows vs table; extra columns are a gap · 3.5" | Truth now uses the **same 11-column table** we do. Real gaps are different (custom date, languages). **3/5**. |

Two of the lowest-scored "fixable" surfaces have moved. **Therefore scores from the handoff are treated as hypotheses, not facts.** Phase 1 re-verifies every surface live at **1440px** before any fix.

---

## 1. Method (per surface — this is the `/goal` loop)

```
navigate truth (Chrome :9222/:9223)  →  exercise it like a user (filters, sort, paginate, hover, open menus, row-click)
  → navigate clone SAME path (emulate viewport 1440×900 first — 390px pin renders mobile)
  → diff: structure · controls · behaviour · copy · data-shape · polish
  → score /5 ; if ≥4 or only data-blocked gaps remain → done, next surface
  → else fix smallest gap → pnpm typecheck (touched pkg) → reload clone tab → re-score
  → independent subagent confirms the score before marking the surface done
```

Browser rule: **one Chrome instance, two tabs** (truth + clone). Never `new_page` first; never navigate the truth tab to localhost.

---

## 2. Scope split

**IN (internally fixable — must reach ≥4):** page structure, headings, filters/controls, sort, pagination, taxonomy, copy, empty-state wording, missing pages/sections, layout/overflow bugs.

**DATA-BLOCKED (legitimately cap a surface <4 — honest empty-state is the *correct* deliverable, do NOT fabricate):**
Meta ad ingest (Ads, app-detail Meta Ads) · Apple Search Ads · creators/organic video feed · non-US markets (Trending/Rising) · Apple review sync · AI keys `GOOGLE_GENAI_API_KEY` (Screenshots/Translations) · billing/auth (Settings credits, API Keys balance).
For these: ship the full UI shell + truth-accurate empty/disabled state, score the *shell*, and label the data cap explicitly.

---

## 3. Decisions needed (defaults assumed unless you say otherwise)

1. **Sidebar IA** — realign clone groups/labels/order to truth (`EXPLORE / YOUR APPS / ASO / ANALYTICS / APP IDEAS`, "Ads" not "Ads Library", un-collapse Studio/Developers)?
   → **DEFAULT: YES, realign.** Handoff states brand is the *only* intentional divergence, so IA drift is a bug.
2. **Clone-only over-builds** not on truth (Builder / App Engine / Studio section; "Clone to iOS" card on app-detail).
   → **DEFAULT: hide from truth-mirrored nav/detail to match parity; keep the code behind a flag** (non-destructive). Confirm if you'd rather keep them visible.
3. **Billing/auth ownership** (Settings credits, API Keys balance/tiers) — confirm no other lane owns this before building the paid parts. Build the non-billing structure regardless.

---

## 4. Prioritised epics

Each epic = one or more surfaces. "AC" = acceptance criteria (the ≥4 bar). Confidence tag: **[CONFIRMED]** verified live this session · **[VERIFY]** from handoff, re-check live first.

### P0 — biggest holes

**E1 · Organic page — build from zero [CONFIRMED missing]**
`/dashboard/organic` currently redirects to Explore (no route in `App.tsx`).
- AC: new route + `OrganicPage.tsx`; `h1` "Organic Content"; filter rail (category / ad-language / sort: Newest indexed, High→Low, Low→High) + Prev/Next; responsive grid of creator-video cards (TikTok/Instagram) per app.
- Data-blocked: the videos themselves (creator ingest). Ship the grid + **honest empty-state**; score the shell. Target ≥4 on shell.
- Files: create `apps/web/src/pages/OrganicPage.tsx`, register in `App.tsx`, sidebar entry.

### P1 — Explore polish (the surface you're actively on) [CONFIRMED 3/5]

**E2 · Custom date dialog** — truth "Custom" (Released **and** Updated) opens a calendar dialog (After / Before / Range + month grid, ~35 gridcells). Clone's "Custom" renders nothing usable.
- AC: clicking Custom opens a date dialog with After/Before/Range modes + month grid; selection writes `releasedAfter=custom&releasedAfterDate=YYYY-MM-DD` (Explore already *parses* these — wire the UI to *write* them) and refetches.
- Files: `components/ExploreFilterRail.tsx` (TimeWindowRow), `lib/exploreFilters.ts`.

**E3 · App Language parity** — clone: 24 plain names, no search. Truth: ~50+ langs, country+locale-code labels (`United States English EN`) + "Search languages…" box.
- AC: expand language list to truth's set; add searchable input; label format `Country Language CODE`.
- Files: `components/ExploreFilterRail.tsx`, language dataset.

**E4 · Explore minor parity** — Source default (clone pre-selects both stores; truth selects neither = all); category emoji fidelity (clone falls back to generic 📱); pagination copy (`1–50 of …` vs truth `Page 1 / 40000`); fix the **1302px table overflow** in the 1196px column; investigate the explore raster/animation timeout.
- AC: each matches truth visually/behaviourally; no horizontal overflow at 1440px.

### P1 — structural

**E5 · Sidebar IA realign [VERIFY]** (pending Decision 1)
- AC: group headers, order, and labels match truth exactly; "Ads" label; Studio/Developers un-collapsed per truth taxonomy.
- Files: `components/Sidebar.tsx`.

### P2 — headings & polish across dashboards [VERIFY each live]

**E6 · Page headings + Highlights table** — add page `h1`/`h2` where truth has them (Explore "Explore Apps", Trending "Store Rankings", Rising "Rising Apps", Highlights "Dashboard Highlights"); Highlights still missing column-header rows + "#" rank prefix (`CLONE-GAP.md` items open).
- Files: `components/PageShell.tsx`, `pages/HighlightsPage.tsx`, `components/RankList.tsx`.

**E7 · App-detail parity** — add **Organic Content** section (shell); split the single "Details" card back into truth's 6 stat-cards (Creators/Meta Ads/Apple Ads/Size/Platforms/Rating); add media All/Videos/Images tabs. (Chart Daily/Total + ranges already match.)
- Files: `pages/AppDetailPage.tsx`, `components/MetricBar.tsx`, detail components.

### P2 — account / dev surfaces [VERIFY — likely advanced like Pricing]

**E8 · Settings / API Keys / MCP / Docs** — re-verify live first (handoff scored these from code only, and Pricing proves code-only scores drift). Build the **non-billing** structure to parity; gate credit/billing parts behind Decision 3 + data.
- Truth refs: Settings (Pro-plan card, Export History, team members), API Keys (credit balance, rate limits, request log, buy tiers, per-call credit model), MCP (connect steps, tool list, FAQ, `claude mcp add` + config JSON), Docs (multi-page: Quickstart/Auth/Filters/Credits/Rate-Limiting/Errors + endpoints).
- Files: `pages/SettingsPage.tsx`, `pages/ApiKeysPage.tsx`, `pages/McpLandingPage.tsx`, `pages/DocsPage.tsx`.

### Continuous — re-baseline the rest [VERIFY]

**E9 · Live-verify the 12 code-only-ranked surfaces** at 1440px before trusting their scores: Favorites, Keyword Explorer, App Tracking, Screenshots, Translations, Reviews, Hot Ideas, Trending, Ads, plus anything above marked [VERIFY]. Correct the scorecard, then fix any that fall <4 on internal grounds.

---

## 5. `/goal` execution queue (order)

```
1. E1  Organic page            (P0 — missing)
2. E2  Explore Custom date     (P1 — confirmed functional gap, you're on this surface)
3. E3  Explore App Language    (P1)
4. E4  Explore minor + overflow(P1)
5. E5  Sidebar IA realign      (P1 — after Decision 1)
6. E6  Headings + Highlights   (P2)
7. E7  App-detail sections     (P2)
8. E8  Settings/API/MCP/Docs   (P2 — re-verify first)
9. E9  Re-baseline remaining   (continuous)
```

Each step runs the §1 loop to **≥4/5 or data-capped**, subagent-verified, before advancing. Stop conditions per `.cursor/skills/goal/SKILL.md` (≥4, external blocker, same error 3×, 10 iters, or user stop).

---

## 6. Definition of done (project)

- Every truth surface re-verified live at 1440px and scored ≥4, **or** explicitly data-capped with a truth-accurate empty-state and the blocker named.
- No fabricated data. `pnpm typecheck` green. No horizontal overflow at 1440px. Brand is the only divergence.

## 7. Source artifacts

- Handoff (baseline, treat scores as hypotheses): `docs/session-handoffs/2026-06-22-appkittie-clone-parity-audit.md`
- Capture diffs: `tmp/audit/` (`ref-*` truth, `tgt-*` clone; fresh `truth-explore*.snapshot.txt`, `clone-explore*.snapshot.txt` this session)
- Rules + gate: `CLAUDE.md` · Domain: `CONTEXT.md` · Prior Highlights QA: `CLONE-GAP.md`
