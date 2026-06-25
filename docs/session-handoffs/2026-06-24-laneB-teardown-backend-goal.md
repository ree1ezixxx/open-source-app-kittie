# Lane B — `teardown_app` backend (DELIVERED)

> This doc was originally a goal prompt drafted from a thin snippet; it conflicted with the
> worktree's authoritative `LANE-BRIEF.md` (wrong output type/endpoints, and it would have
> touched `apps/web`, which Lane C owns). It has been **realigned to the brief**, which is what
> was actually built. Source of truth: `osk-intel-teardown/LANE-BRIEF.md` + `~/.claude/plans/2026-06-24-app-intelligence-p0-plan.md`.

**Worktree** `osk-intel-teardown` · **branch** `feat/app-intel-teardown` · web 5177 / API 3019 / Chrome :9224.
**Owns** `packages/intelligence/src/teardown/` + `packages/api/src/routes/app-intelligence/teardown.ts` (+ `lib/gamma.ts`, `services/teardown-service.ts`). Did **not** touch `apps/web` (Lane C).

## What it is
`teardown_app` turns an app id into a structured **product blueprint** (`TeardownAppOutput`), anchored on `DecisionPacket`/`Provenanced`. Backend synthesis only. Scores deterministic; narrative via a **local** model; never fabricated.

## Endpoints
- `GET  /api/v1/app-intelligence/apps/:id/teardown?depth=quick|standard|deep`
- `POST /api/v1/app-intelligence/teardown` `{ appId, depth? }`
- 404 unknown id · 400 bad body · `depth` clamps to what's implemented (now `deep`).

## Depth ladder
- **quick** — deterministic, **NO LLM**: identity, modelled metrics, monetisation, deterministic risks, review-tag aggregation, reused app/category `decisionPacket`, `agentSummary`. Instant.
- **standard** — + cached local-LLM narrative: thesis, core problem, audience, core loop (Hooked), feature map, clone insights (copy/dont-copy/gaps/mvp/premium/difficulty). ~80s cold/app, instant cached.
- **deep** — + ASO model (observed ASA keywords + locales, deterministic), review clustering (loved/pain/requested), **vision** screen-map from the first screenshot. Cached.

## LLM = local gamma (not Gemini)
`packages/api/src/lib/gamma.ts` → Ollama `gemma4:12b` (text + vision), OpenAI-compatible endpoint, free/offline. Cached in `ai_generations` (records the real model id). **Degrades to quick** if the model is down/slow — never fabricates. Env: `GAMMA_MODEL`, `GAMMA_BASE_URL`, `GAMMA_TIMEOUT_MS`, `GAMMA_MAX_TOKENS`. Note: 12b is ~10 tok/s → first call per app is slow; caching makes repeats instant.

## Honesty contract
Every synthesized section carries a `labels[section]` tag (`observed|modelled|inferred|missing` + note). Metrics stay `modelled`; blocked sources (Meta ads, un-mined themes) sit in `decisionPacket.coverage.missing`; absent data (no reviews / no ASA / no screenshot) → honest `missing`, never invented.

## Files
`packages/intelligence/src/teardown/{types,index,teardown.test}.ts` · `packages/intelligence/src/index.ts` · `packages/api/src/lib/gamma.ts` · `packages/api/src/services/teardown-service.ts` · `packages/api/src/routes/app-intelligence/{index,teardown}.ts` · `packages/api/src/app.ts` (mount).

## Run
`pnpm install` (first time) → `DATABASE_URL=file:/Users/ellis/Documents/open-source-app-kittie-workspace/data/kittie.db RUN_SWEEPS=0 PORT=3019 pnpm --filter @kittie/api exec tsx src/index.ts`. Ollama must be running (`ollama ps`). Smoke: `curl -s "localhost:3019/api/v1/app-intelligence/apps/apple:570060128/teardown?depth=deep"`.

## Status
3 commits on `feat/app-intel-teardown` (quick `869f3fa` · standard `ba8f5de` · deep `70d84c8`). Typecheck green (14 pkgs); 4/4 unit tests; curl-verified quick/standard/deep on real apps (Kalshi, Duolingo). DoD §7.10 met.
**Landing:** PR → main (squash). Per the brief, B depends on Lane A's shared-contracts foundation — `app-intelligence/index.ts` is a thin aggregator Lane A extends, so expect a small rebase once A merges.
