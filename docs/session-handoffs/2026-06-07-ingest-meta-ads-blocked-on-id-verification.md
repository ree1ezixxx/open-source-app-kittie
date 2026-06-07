# Session Handoff — Ingest: Meta Ad Library blocked on ID verification

## Where it started

Session 2 (`feat/ingest`) owns data collection for the open-source App Kittie clone. P0 ingest (charts, metadata, snapshots, score) was already shipped. This session continued with worktree isolation, review sync, and starting Meta Ad Library API setup so we can populate `meta_ads` for Session 3's `hasMetaAds` filter and revenue bonus.

## Decisions locked + what shipped

- **Worktree split** — ingest lives in `/Users/ellis/Documents/open-source-app-kittie-ingest` on `feat/ingest`; foundation/Session 3 in `/Users/ellis/Documents/open-source-app-kittie` on `feat/foundation` (commit `d5bf7ab` stripped ingest score/review-sync from foundation).
- **Shared DB** — `open-source-app-kittie-ingest/data` → symlink to `open-source-app-kittie/data/kittie.db`.
- **Review sync (P1)** — built on `feat/ingest`: `packages/ingest/src/apple/reviews.ts`, `google/reviews.ts`, `db/reviews.ts`, `jobs/review-sync.ts`, `pnpm ingest:reviews`. Test run: 150 reviews for 10 apps only.
- **`.env` created** — `/Users/ellis/Documents/open-source-app-kittie-ingest/.env` with `DATABASE_URL` + `META_ACCESS_TOKEN` (gitignored).
- **Meta app `pluto`** — Facebook developer app created; Facebook Login use case added; Basic settings saved (icon, contact email, URLs on `radyrrangers.football`).
- **Meta Ad Library API** — **blocked**. Token in `.env` only grants `public_profile`; `ads_read` does not stick until Facebook identity verification completes. User submitted gov ID via `facebook.com/ID` (political-ads identity flow — required by Meta for Ad Library API even for research use).

## Ingest progress (helicopter view)

| Area | Status |
|------|--------|
| Apple/Google seed + snapshot + score | ✅ 283 apps, 283 snapshots, all scored |
| Review sync | ✅ Built; ⏳ full 283-app run not done |
| Meta ads collector | ⏳ Stub only (`packages/ingest/src/meta/ad-library.ts`) |
| IAP / keywords / creators | ⏳ Not started (P2) |

## Key files for next session

- `/Users/ellis/Documents/open-source-app-kittie-ingest/docs/session-handoffs/SESSION-2-INGESTION.md` — original ingest scope
- `/Users/ellis/Documents/open-source-app-kittie/docs/session-handoffs/2026-06-07-session-3-status-for-session-2.md` — Session 3 is wired; ingest feeds it
- `/Users/ellis/Documents/open-source-app-kittie-ingest/packages/ingest/src/meta/ad-library.ts` — stub to implement
- `/Users/ellis/Documents/open-source-app-kittie-ingest/.env` — paste new token here after ID approval
- `/Users/ellis/Documents/open-source-app-kittie-ingest/packages/ingest/src/jobs/review-sync.ts` — ready to run

## Worktrees + branches

```
/Users/ellis/Documents/open-source-app-kittie         feat/foundation  (Session 1 + 3)
/Users/ellis/Documents/open-source-app-kittie-ingest  feat/ingest      (Session 2 — work here)
```

Latest ingest commit: `ceae187` (data symlink). Ingest code at `a02184c` + symlink commit.

## Running state

- Background processes: none
- Dev servers: none required for ingest
- DB: `/Users/ellis/Documents/open-source-app-kittie/data/kittie.db` (283 apps, 150 reviews, 0 meta_ads)
- Meta ID verification: **submitted, ~48hr wait** (user report)

## Verification — how to confirm things still work

```bash
cd /Users/ellis/Documents/open-source-app-kittie-ingest
pnpm ingest:seed      # if DB empty; skip if 283 apps present
sqlite3 data/kittie.db "SELECT COUNT(*) FROM apps;"
# → 283

# After ID approved + new token in .env:
set -a && source .env && set +a
curl -sG "https://graph.facebook.com/v22.0/me/permissions" -d "access_token=$META_ACCESS_TOKEN"
# → must show ads_read granted, not just public_profile

curl -sG "https://graph.facebook.com/v22.0/ads_archive" \
  -d "search_terms=calm" \
  -d 'ad_reached_countries=["US"]' \
  -d "limit=1" \
  -d "fields=id,page_name" \
  -d "access_token=$META_ACCESS_TOKEN"
# → JSON with data array, not error 2332002
```

## Meta setup checklist (for user after ID approved)

1. [facebook.com/ads/library/api](https://www.facebook.com/ads/library/api) → **Access the API** → app **pluto**
2. [Graph API Explorer](https://developers.facebook.com/tools/explorer) → app **pluto** → permission **`ads_read`** → **Get User Access Token**
3. Replace `META_ACCESS_TOKEN` in `.env` with new token
4. Tell agent: **"token updated, ID approved"**

## Deferred + open questions

- **Deferred: Meta ads collector** — blocked on Meta identity verification (~48hr).
- **Deferred: full `pnpm ingest:reviews`** across all 283 apps (no blocker).
- **Deferred: second snapshot day** — needed for real 7d growth deltas.
- **Open:** Confirm Meta ID approval email/status before regenerating token.
- **Note:** Meta bundles Ad Library API ID check with "political ads" flow — user is NOT running political ads; this is the only path Meta provides for API access.

## Pick up here

After Meta ID is approved: regenerate token with `ads_read` → update `.env` → verify curl above → implement `packages/ingest/src/meta/ad-library.ts` + `pnpm ingest:meta-ads` job. Until then, optional: run full `pnpm ingest:reviews` and schedule daily `pnpm ingest:snapshot`.
