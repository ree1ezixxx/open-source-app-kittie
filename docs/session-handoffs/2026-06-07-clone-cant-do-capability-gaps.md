# Session Handoff — What the Clone Can't Do (Capability Gaps)

**Date:** 2026-06-07
**Worktree:** `feat/ui` (cross-cutting — limits span ingest / intelligence / foundation too)
**Why this exists:** The UI commit `8bf3ccc` captured the *can-do* side (dashboard ships only the data-backed surfaces — Database / Trending / Rising — and deliberately drops the data-gated ones). This doc captures the *can't-do* side so a fresh agent knows the real limits before promising any of them. Some are already documented elsewhere (pointers below); the **uncaptured gaps** in §2 are the point of this handoff.

---

## 1. Can't-do — already documented (pointers only, don't re-litigate)

| Limit | Why | Captured in |
|---|---|---|
| Meta Ad Library / `meta_ads` / `hasMetaAds` filter | `meta/ad-library.ts` is a `return 0` stub; Meta token only grants `public_profile`. `ads_read` blocked behind Facebook gov-ID identity verification (~48 hr, submitted). | `…-ingest/.../2026-06-07-ingest-meta-ads-blocked-on-id-verification.md` |
| Real historical revenue/growth charts (true deltas) | Only **1 distinct `snapshot_date`** in the DB. Charts + 7d-growth need ≥2 calendar days of `pnpm ingest:snapshot`. | foundation-needs-from-session-2/3, session-3-pause, UI-WORKTREE |
| Review **text bodies** in the UI | Data is in DB + API (`POST /reviews`), but the dashboard renders only counts + trend chart. | `…/foundation-reviews-brainstorm.md` |
| Review sentiment / bad-review pattern detection + cross-app review search | Not built; only display shipped. CONTEXT.md explicitly defers sentiment "until explicitly built". | `…/foundation-reviews-brainstorm.md` |
| Data-gated surfaces (ads-spy, creators, keywords, country rankings) | Ingestion doesn't exist yet → omitted from nav, not stubbed. | commit `8bf3ccc` message |
| IAP / keyword / creator / Apple-Search-Ads ingestion | Not started (P2). Tables exist, empty. | foundation-needs-from-session-2, session-3-pause |

---

## 2. Can't-do — NOT yet captured anywhere (the actual gaps)

These exist in code or live data but have no handoff. **This is the section to action.**

### G1 — Preview / screenshot videos are never collected
- Hardcoded in UI copy: `AppDetailPage.tsx` → *"Preview videos aren't collected yet."*
- No ingestion path exists for store preview videos; only static listing screenshots are fetched.
- **Unblock:** add a preview-video collector to the ingest media job, or keep the honest empty-state and stop implying it's coming.
- Pointer: `apps/web/src/pages/AppDetailPage.tsx` (grep "Preview videos aren't collected").

### G2 — `meta_ads`, `iaps`, `creators`, `keywords` tables are ALL empty (0 rows)
- Handoffs call Meta-ads "blocked" and IAP/creators "P2", but none state that the **detail page's IAP block, Ad-creative surface, and creator UI silently render nothing for every app today** — despite being first-class CONTEXT.md domain terms.
- Risk: looks "built" in schema + glossary; is non-functional in production data.
- **Unblock:** gate these UI sections behind a real "no data yet" empty-state, and don't advertise them as features until their tables fill.
- Pointer: detail page IAP block guarded by `app.iaps.length > 0` in `AppDetailPage.tsx`.

### G3 — API mock-fallback can silently serve FAKE data
- If the shared DB is ever empty/unreachable, `searchApps` / `getAppById` / `getAppReviews` fall back to `MOCK_APPS` with **no user-visible "this is mock data" signal**.
- Footgun: a fresh clone before `pnpm ingest:seed` shows fabricated apps as if real.
- **Unblock:** add a response header / banner flag (e.g. `x-data-source: mock`) and surface it in the UI, or hard-fail when the DB is empty in non-dev.
- Pointer: `…-intelligence/packages/api/src/services/app-service.ts` (`dbHasApps()` gate + `MOCK_APPS`).

### G4 — Port drift: UI expects :3007, all other docs say :3000
- Commit `8bf3ccc` points the Vite proxy at **:3007** (3000 is taken by `mobbin-mirror` locally). Every intelligence/foundation handoff + verification `curl` snippet still says **:3000**.
- Anyone following the documented verification against the UI worktree will mismatch.
- **Unblock:** standardise on `PORT=3007 pnpm dev:api` everywhere, or read `PORT` from `.env` and update all handoff snippets.
- Pointer: `apps/web/vite.config.ts` proxy target.

### G5 — `is_first_mover` / growth ranking are meaningless with 1 day of data
- Stronger than "charts are flat": the **core product promise** (first-mover / growth score) is currently *undeliverable*, not just sparse. One snapshot ⇒ no deltas ⇒ score has no signal.
- **Unblock:** same as the multi-day blocker (G7); until then, hide or label the growth/first-mover columns as "pending baseline".

### G6 — API caches scored rows until process restart (no TTL/invalidation)
- `db-app-service.ts` caches; goes stale after a new ingest. Listed only as a P1 todo in session-3-pause, never as a current correctness limit.
- **Unblock:** add a TTL or invalidate on ingest write.
- Pointer: `…-intelligence/packages/api/src/services/db-app-service.ts`.

### G7 — No scheduled snapshot job exists (the root blocker)
- Handoffs repeatedly say "run `pnpm ingest:snapshot` daily (or document a cron)" — **the cron was never set up.** So G5 + the historical-charts blocker persist *indefinitely* unless someone runs it by hand each day.
- **Unblock:** add a cron/launchd entry (or a `schedule` routine) that runs `pnpm ingest:snapshot` once daily. This single action unblocks G5 and real charts after ~2 days.

---

## 3. Suggested order for next session
1. **G7** — set up the daily snapshot cron first (everything date-based depends on it; cheap, high-leverage).
2. **G3** — add the mock-data signal (correctness footgun, fast).
3. **G4** — kill the port drift across docs (5-min consistency fix).
4. **G2 + G1** — honest empty-states for the 0-row surfaces so nothing reads as "built but broken".
5. **G6** — cache invalidation.
6. **G5** — relabel growth/first-mover columns "pending baseline" until day-2 data lands.

## 4. Key file pointers
- Shared DB: `…-app-kittie/data/kittie.db` (283 apps, 1 snapshot day, 13,320 reviews, 0 meta_ads/iaps/creators/keywords).
- Meta stub: `…-ingest/packages/ingest/src/meta/ad-library.ts` (`return 0`).
- Meta token: `…-ingest/.env` (paste `ads_read` token after ID approval).
- Mock fallback: `…-intelligence/packages/api/src/services/app-service.ts`.
- Unbounded cache: `…-intelligence/packages/api/src/services/db-app-service.ts`.
- Detail page empty-states: `…-ui/apps/web/src/pages/AppDetailPage.tsx`.
- Proxy port: `…-ui/apps/web/vite.config.ts`.
- Glossary: `…-app-kittie/CONTEXT.md` (uncommitted — has the Review terms; commit it).
