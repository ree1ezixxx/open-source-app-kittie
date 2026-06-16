# READ ME FIRST — all lanes (A/B/C/D)

**You are in a SPECS-ONLY folder. There is no application code here. Do not go looking for it.**

`/Users/ellis/Documents/open-source-app-kittie/` contains only these handoff markdown files. It is **not a git repo** (the enclosing git repo is `/Users/ellis` itself). The `apps/web` + `packages/api` monorepo your handoff references **is not cloned on this machine yet** — that is expected, not a bug, not "blocked", not wiped.

## Don't waste a turn doing this (already done, all negative)
- `find ~ -name RisingPage.tsx` / `db-app-service.ts` / `*kittie*` → nothing
- No `feat/*-rows` branches, no `coordinator/` scripts, no `.cache/live-*` audit reports exist locally
- The only `apps/web` dirs on disk (`mobbin-mirror`, `open-design`, `visual-context-os`) are **unrelated projects**

If you search and find nothing: that is the known state. Stop, don't escalate, don't assume something broke.

## What you CAN do right now (no code needed)
- Read your lane spec and the truth site, grill the requirements, and write a **PRD** for your lane.
- Lane specs:
  - A · Explore → `HANDOFF-A-explore.md`
  - B · Highlights → `HANDOFF-B-highlights.md`
  - C · Rising → `HANDOFF-C-rising.md`
  - D · Trending → `HANDOFF-D-trending.md`

## What you CANNOT do until the monorepo is local
- Implement, run dev servers (web 518x / api 301x), `pnpm typecheck`, or fidelity-QA against the truth site.
- These need the code. To get it: **clone the remote** (ask Rhodri for the URL) **or scaffold greenfield** (`apps/web` + `packages/api`). Until then, implementation tasks are parked.

## Cross-lane facts worth knowing
- MRR cells (Rising/Highlights) consume **Lane D's** estimation model (`packages/intelligence`) — build/export that first.
- The shared `db-app-service.ts` is touched by the country-filter work (Lane C) — keep changes additive, flag in PR to avoid collisions.

## More context (optional)
- Path index / what cleanup deleted vs kept: `/Users/ellis/Documents/Codex/handoffs/storage-cleanup-and-paths.md`
- Why a prior agent thought it was "blocked": `/Users/ellis/Documents/Codex/handoffs/lane-c-rising-prd-blocked.md`
- Folder-level guidance: `../../CLAUDE.md`
