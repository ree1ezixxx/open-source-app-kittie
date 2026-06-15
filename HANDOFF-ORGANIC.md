# HANDOFF — Organic Content (`/dashboard/organic`)

You are the **build agent** for the **Organic Content** page of the Kittie clone. Build in THIS worktree only:
`/Users/ellis/Documents/open-source-app-kittie-organic` (branch `feat/organic`).

> Note: a stale `HANDOFF.md` (with merge-conflict markers) exists from an earlier lane plan — **ignore it; this file supersedes it.** Background docs: `docs/clone/api-contract.md`, `docs/session-handoffs/2026-06-07-clone-cant-do-capability-gaps.md`.

## The project in one paragraph
We are cloning the app-intelligence dashboard at **`appkittie.com`** ("**truth**") into our local app ("**clone**"). A separate **coordinator** owns the browser and will QA your output against truth — you do **not** drive a browser. Make `/dashboard/organic` on the clone match truth in structure, data shape, behaviour, and visuals. Pages are compared by **URL path**, not label.

## This is a GREENFIELD page — it does not exist yet
There is **no Organic page, route, sidebar entry, API endpoint, or DB table** in the clone today. You are building the whole vertical slice. **But it is a near-twin of the Ads Library**, so template heavily off the ads work.

## Your source of truth
- Live page: `https://www.appkittie.com/dashboard/organic` (you can't open it — the coordinator does).
- **A full a11y snapshot of truth is staged here: `TRUTH-organic.snapshot.txt`** — read it for exact structure, labels, ordering.

### What truth looks like (verify against TRUTH-organic.snapshot.txt)
- Header: H1 **"Organic Content"**, subtitle **"Browse apps with creator videos"**, a **"Refresh organic content"** button, search box, "Search in: All" scope dropdown.
- Filter rail: **App**, **Category**, **App language**, **Downloads** (min/max), **MRR** (min/max), **Sort** (Sort by + Direction), **Clear all** — identical set to Ads.
- Count line: "Showing 12 of 37.5K apps" + pager "Page 1 / 3.1K".
- **Results grouped by APP.** Each app card has:
  - app icon, rank `#`, name (link), developer, **"Open app"** link
  - rating, reviews, **REVENUE**, **INSTALLS**, **RELEASED**, and **VIDEOS** (count — this is the only metric label that differs from Ads, which says "META ADS")
  - a **horizontal carousel of creator videos**. Each item is a **creator UGC video** attributed to a handle — buttons read **"Open organic video from @handle"** (e.g. `@cecilia.gaming`, `@aippyai`). Plus app screenshots and a **"Scroll organic videos right"** control.

### The ONE difference vs Ads
Organic = **creator/UGC videos with @handle attribution** (think TikTok creators), Ads = **paid Meta creatives**. Same card+carousel shell; different data source, the "VIDEOS" metric label, and per-video creator handle.

## Build off the Ads lane
The Ads worktree (`../open-source-app-kittie-ads`, branch `feat/ads`) is building the same card+carousel shell first. **Reuse its `CreativeCarousel` component pattern** — coordinate so organic uses the same carousel (copy/adapt it; both branched from the same base so it should port cleanly). Don't reinvent the carousel.

## What to build (full slice)
1. **DB:** add an `organic_videos` table in `packages/db/src/schema.ts` — mirror `meta_ads` but with creator fields: `id, appId (FK apps.id), creatorHandle, platform, videoUrl, thumbnailUrl, caption, postedAt, firstSeenAt, lastSeenAt`. Generate + run a migration (`pnpm db:generate && pnpm db:migrate`).
2. **Seed:** no real organic data exists (capability gap — be honest). Write a seed script adding representative `organic_videos` rows linked to existing apps, with realistic `@handles`, so the page renders like truth.
3. **API:** add **`GET /api/v1/organic`** in `packages/api/src/routes/organic.ts` (template off `routes/ads.ts`). Same params (`appId, categories, search, downloads, mrr, sortBy, sortOrder, page, limit`) and an **app-grouped response** (app card + `videos[]` array + app metrics + VIDEOS count). Register it in `packages/api/src/app.ts` next to `v1.route("/ads", adsRouter)`.
4. **Client:** add `listOrganic()` to `apps/web/src/lib/api.ts` (template off the ads client fn).
5. **Page:** create `apps/web/src/pages/OrganicContentPage.tsx` (template off `AdsLibraryPage.tsx`). App-grouped cards + the shared carousel showing creator videos with @handle labels; "VIDEOS" metric; all filters; pagination; loading/empty/error states.
6. **Route:** in `apps/web/src/App.tsx` add `<Route path="/dashboard/organic" element={<OrganicContentPage … />} />` (follow the existing page-prop pattern: `theme`, `onToggleTheme`).
7. **Sidebar:** in `apps/web/src/components/Sidebar.tsx` add to the EXPLORE group: `{ to: "/dashboard/organic", label: "Organic Content", icon: <pick a fitting icon from icons.tsx> }`. Place it to match truth's nav order (Apps, Ads, Organic, Highlights, Trending, Rising).

## Reference (do not edit)
- `apps/web/src/pages/ExplorePage.tsx` — gold-standard page (URL-driven filters via `useSearchParams`, data hook, filter rail, results, pagination, empty/error states).
- `apps/web/src/pages/AdsLibraryPage.tsx` — your closest template (and the source of the shared carousel).
- `packages/api/src/routes/ads.ts` + `packages/db/src/schema.ts` (`meta_ads`) — backend templates.
- Reusable components: `FilterGroup`, `RangeFilter`, `Segmented`, `Pagination`, `AppIcon`, `EmptyState`, `Topbar`, `ActiveFilters`.

## Styling
No Tailwind / CSS-in-JS. Global CSS vars in `apps/web/src/index.css` (`--panel`, `--surface`, `--border`, `--text`, `--text-secondary`, `--accent` `#c6f24d`, `--radius`, `--radius-lg`); theme via `lib/theme.ts`; category colours via `lib/palette.ts`. Match the ads card conventions.

## Conventions (read CONTEXT.md + AGENTS.md at worktree root)
- Wrap all content in components — no loose page text.
- Types from `@kittie/types`; add organic types there.
- Follow domain naming in CONTEXT.md (organic videos are creator/UGC content, distinct from `meta_ads`).

## Setup & run — OWN ports (`:5173`/`:3007` and `:5174`/`:3017` are taken by other worktrees)
```bash
cd /Users/ellis/Documents/open-source-app-kittie-organic
pnpm install
pnpm db:migrate              # creates this worktree's data/kittie.db (per-worktree, gitignored)
pnpm ingest:seed            # seeds 283 apps + reviews
pnpm db:generate && pnpm db:migrate   # after you add the organic_videos table
# then run your organic seed script
PORT=3018 pnpm dev:api       # API on 3018
pnpm dev:web -- --port 5175  # web on 5175
```
- **Edit `apps/web/vite.config.ts`**: set `server.port` to **5175** and the `/api` proxy target to **`http://localhost:3018`**.
- Shortcut for base data: copy a populated `data/kittie.db` from `../open-source-app-kittie-simulator-first-builder/data/`, then add your `organic_videos` seed.

## Definition of done (coordinator verifies against truth)
1. `/dashboard/organic` exists, is reachable from the sidebar, and renders on `:5175`.
2. Header H1 "Organic Content" + subtitle + "Refresh organic content" + search/scope present.
3. **App-grouped cards** each with a working **horizontal carousel of creator videos**, each labelled with its **@handle**, matching `TRUTH-organic.snapshot.txt`.
4. Metric labels match truth — note **"VIDEOS"** (not "META ADS").
5. All filters + pagination present and functional; count line format matches truth.
6. Real (seeded) data renders non-zero from `/api/v1/organic`.
7. `pnpm typecheck` passes. No console errors.

## Working rules
- Stay in this worktree. Do not edit other branches' paths.
- **Docs hygiene (avoid CONTEXT.md merge conflicts):** do NOT add glossary terms to the root `CONTEXT.md`. When `grill-with-docs` produces new domain terms, write them to **`docs/glossary/organic.md`** (same `**Term**:` / def / `_Avoid_:` format). If grill-with-docs edited root `CONTEXT.md`, relocate those additions into `docs/glossary/organic.md` and revert `CONTEXT.md` to base before committing. The coordinator merges fragments into canonical `CONTEXT.md`.
- After each QA pass the coordinator drops **`CLONE-GAP.md`** here — **read it and fix the listed gaps.** Don't self-declare done; the coordinator decides from the live diff.
- Commit in small, coherent steps on `feat/organic`.
