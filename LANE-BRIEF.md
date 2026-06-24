# LANE B HANDOFF — teardown_app backend  [untracked]

**Branch:** `feat/app-intel-teardown` · **Base:** `main` 1b603d0 · **Web:** 5177 · **API:** 3019 · **Chrome:** slot 2 → :9224
**Read first:** `~/.claude/plans/2026-06-24-app-intelligence-p0-plan.md` · **PRD:** pasted in chat 2026-06-24 (§7 teardown, §8 contracts).
**Depends on Lane A foundation** (shared contracts). Scaffold against `packages/types` + the existing `AppDetail` now; rebase onto `main` once A's foundation merges. Fully parallel with Lane A otherwise (teardown is standalone — needs only an app ID + existing data).

## Mission
`teardown_app` — turn an app into a structured product blueprint. **Backend synthesis only** (the canvas/section UI is Lane C). Endpoints:
- `POST /api/v1/app-intelligence/teardown`
- `GET  /api/v1/app-intelligence/apps/:id/teardown`
Owns `packages/intelligence/src/teardown/` + `packages/api/src/routes/app-intelligence/teardown.ts`.

## REUSE (real pointers)
- **All observables already on `AppDetail`** (`packages/types/src/index.ts:153`): metrics, estimates, IAPs, meta/apple ads (empty-state), reviews + `ReviewTags` (topics/improvementAreas via `reviewClassifier.ts`), chartRank, languages, price, first-mover, and the served `decisionPacket?`. Teardown SYNTHESIZES from this — the data is there, the analysis layer is net-new.
- **Output shape:** compose `DecisionPacket` for the decision/confidence/evidence parts (`packages/types/src/decision-packet.ts:51`, builder `intelligence/decision-packet.ts:45`). Anchor new teardown types on it — don't fork PRD §8.
- **Deterministic scorers:** `intelligence/{growth,revenue}.ts`, `reviewClassifier.ts` for review insights.
- **LLM (narrative only):** `packages/api/src/lib/gemini.ts:39` (`cachedGenerate`/`generateJson`, `ai_generations` cache). Example: `services/idea-sweep-service.ts:200`.
- **Screenshots → UI blueprint (deep mode):** `@kittie/visual` `analyseListingMedia()`, `deriveOriginalUiBlueprint()`.

## BUILD (net-new)
- The structured `TeardownAppOutput` (PRD §7.4/§7.5): identity · one-line thesis · core user problem · audience · **core loop** (Trigger→Action→Reward→Progress→Return) · **feature map** (table-stakes/retention/monetisation/differentiator) · monetisation model · ASO model · review insights · **clone insights** (copy / don't-copy / gap / MVP / premium layer / clone difficulty) · risks · confidence · nextActions.
- **Depth levels (§7.6):** `quick` = **deterministic, NO LLM** (identity + metrics + existing decisionPacket + top risks) so it's free in tight agent loops; `standard` = + audience/core-loop/feature-map/review-insights/clone-insights (LLM, cached); `deep` = + screen-map (via `@kittie/visual`) + ASO + review clustering.

## Constraints (hard)
Anchor on `DecisionPacket`/`Provenanced` · **quick mode must not call the LLM** · narrative LLM cached + degrade on quota · never fabricate metrics; blocked sources (Meta ads) → honest empty-state in `coverage.missing` · **no new DB tables** · **don't touch `apps/web`** (Lane C owns the canvas) or `intelligence/similarity`+`idea-validation` (Lane A) · no MCP/billing · pnpm only · `pnpm typecheck` green.

## Acceptance (PRD §7.10)
Given an app ID/URL → structured teardown with identity, thesis, audience, core loop, feature map, monetisation, review insights, clone insights, risks, confidence, evidence. Works in quick/standard/deep. Output renders in UI (Lane C) and is agent-consumable (`agentSummary`). Missing/modelled/stale/inferred data is labelled.

## Run
`pnpm install` (first time) → API: `DATABASE_URL=file:/Users/ellis/Documents/open-source-app-kittie-workspace/data/kittie.db RUN_SWEEPS=0 PORT=3019 pnpm --filter @kittie/api exec tsx src/index.ts`. Smoke: `curl -s localhost:3019/api/v1/app-intelligence/apps/apple:1632713844/teardown?depth=quick`. Sample ids: `apple:1632713844` (Finance/Kalshi), `apple:1508186374` (Entertainment).

## THE LOOP — `/goal`
```
/goal You are in the osk-intel-teardown worktree (Lane B) for Open Source App Kittie App-Intelligence P0. Read LANE-BRIEF.md + ~/.claude/plans/2026-06-24-app-intelligence-p0-plan.md, then work Goal→Act→Observe→Judge loops until the DoD is met. Build teardown_app backend only (intelligence/teardown + routes/app-intelligence/teardown.ts). Start with quick mode (deterministic, no LLM), then standard, then deep. ONE narrow goal per loop. Hard constraints: anchor on DecisionPacket (no PRD §8 fork); quick mode must NOT call the LLM; narrative LLM cached via ai_generations + degrade on quota; never fabricate metrics (blocked sources → coverage.missing); NO new DB tables; do not touch apps/web or Lane A's intelligence dirs; no MCP/billing; pnpm only; API 3019. After each loop return: Goal · Files touched · Endpoint/contract change · Evidence (curl output for the relevant depth + `pnpm typecheck`) · Green/Red · Reason · Next loop. Land via PR → main (squash). Stop when DoD met.
```
