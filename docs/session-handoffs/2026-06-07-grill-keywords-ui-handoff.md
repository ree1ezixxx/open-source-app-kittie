# UI Handoff — Keyword Explorer

> **Target worktree:** `/Users/ellis/Documents/open-source-app-kittie-ui` — branch `feat/ui`
> **API dependency:** `feat/keywords-aso` (live store search, `/api/v1/keywords/difficulty`)

## Decisions locked (grill-with-docs)

| # | Decision |
|---|----------|
| 1 | v1 = **lookup-first** + **suggestions** alongside |
| 2 | Suggestions from **app context** + **database patterns** |
| 3 | Tap suggestion → **run lookup immediately** |
| 4 | Show results + **Keyword insights** (observable hints). **No ASO coach** |
| 5 | **Copy AppKittie nav** — sidebar group **ASO** → **Keyword Explorer** (dedicated page, not inside Explore) |
| 6 | **US only** for country; **Apple + Google** stores (v1) |
| 7 | **Single lookup default + batch compare** (up to 10) — mirrors AppKittie `POST /keywords/difficulty` |
| 8 | Batch results sorted by **opportunity score** — `(popularity × 0.4) + ((100 − difficulty) × 0.3)` v1 |
| 9 | **Keyword insights (standard):** term in #1 title; avg reviews top 5; weakest top-10 link; #1 vs #10 review gap |
| 10 | **Suggestion chips** on Explorer empty state — seeded from tracked app titles + categories |

## UI to build (`feat/ui`)

### Navigation
- [ ] Add sidebar section **ASO** with link **Keyword Explorer** → `/keywords`
- [ ] Match existing Kittie sidebar patterns (`Sidebar.tsx`)

### Keyword Explorer page (`/keywords`)
- [ ] Keyword search input (single lookup on submit)
- [ ] **Compare keywords** mode — up to 10 terms, table via `POST /api/v1/keywords/difficulty`, sorted by opportunity
- [ ] Store toggle (apple / google); country fixed **US** in v1
- [ ] Results: difficulty, traffic score, popularity, competing app count
- [ ] Top 10 ranking apps table/cards (icon, title, rank, reviews, rating)
- [ ] **Keyword insights** panel (standard set)
- [ ] **Suggestion chips** on empty state; tap → immediate lookup

### App detail (optional v1)
- [ ] "Suggested keywords" → `/keywords?q=...` — defer if time-constrained

### API wiring
- [ ] `GET /api/v1/keywords/difficulty`
- [ ] `POST /api/v1/keywords/difficulty` batch, sorted by opportunity score
- [ ] Rebase `feat/ui` onto `feat/keywords-aso` for live API

## Remaining on `feat/keywords-aso` (ingest/API)

- [ ] `opportunityScore` on batch response + server-side sort
- [ ] `GET /api/v1/keywords/suggestions` for suggestion chips
- [ ] `computeKeywordInsights()` helper for standard insight set

## Domain glossary

See `CONTEXT.md` — Keyword, Keyword lookup, Keyword suggestion, Keyword difficulty, Traffic score, Keyword insight, Keyword Explorer, Opportunity score.

## Exit criteria

- [ ] `/keywords` page functional against live API
- [ ] Sidebar nav matches AppKittie ASO placement
- [ ] Suggestion chips on empty state
