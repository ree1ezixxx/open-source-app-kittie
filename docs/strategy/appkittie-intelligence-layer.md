# AppKittie Intelligence Layer Strategy

**Epic:** [#168 Audit Engine - app decision layer](https://github.com/ree1ezixxx/open-source-app-kittie/issues/168)
**Decision record:** [ADR 0012](../adr/0012-own-intelligence-evidence-outcome-loop.md)
**Originating PRD:** [Trending Ideas redesign](../prd/trending-ideas-redesign.md)

## Position

AppKittie should be the app decision layer for builders: find an App or niche,
diagnose the opportunity, prove each claim with evidence, and export a
build-ready brief to a coding harness.

We own the intelligence, evidence, and outcome loop. We do not own an iOS
Simulator, Xcode cloud, or general build runtime.

## Why this layer

- Daily Snapshots, Review history, Keyword intelligence, Listing media, chart
  movement, and source coverage compound inside Kittie.
- Build runtimes are crowded and interchangeable. A brief can route to Codex,
  Claude Code, Rork, Bolt, or another builder.
- The durable moat is the loop from market signal to recommendation to shipped
  outcome, not a "clone button" runtime.

## Data-source priorities

Treat sources by product job, not by prestige.

| Source class | Examples | Product job |
|---|---|---|
| Leading evidence | Google Trends, TikTok ads, Reddit/X velocity, Keyword trend Snapshots, Product Hunt/HN launches | Explain why now and surface early demand before chart movement catches up. |
| Observed Store metrics | Review count, rating, chart rank, update date, Listing media, IAP catalog | Anchor the App and market evidence in public Store facts. |
| Lagging calibration | Google Play install buckets, Meta Ad Library once unblocked, paid data vendors if ever used | Calibrate Estimated metrics and confidence; do not replace evidence. |

Leading signals are evidence, not app-level truth. Missing source data lowers
confidence through `SourceStatus`; it must never score as zero demand.

## Six-score Audit model

The Audit Engine should expose six visible sub-scores plus confidence:

1. **Demand score** - review velocity, Keyword traffic proxies, chart movement,
   and external demand evidence.
2. **Growth score** - Growth period movement from Snapshots, source-status aware
   and reweighted when a source is missing.
3. **Pain score** - Review pain text and complaint clusters.
4. **Monetisation score** - Revenue estimate, IAP/subscription evidence, price,
   and category heuristics.
5. **Competition score** - competitor count, incumbent strength, Keyword
   difficulty, and saturation.
6. **Buildability score** - Blueprint complexity, required services, AI/backend
   needs, and realistic MVP scope.

Each score must carry evidence cards and a confidence explanation. The UI should
make "why this score" as visible as the score itself.

## Build-layer decision

The "build" action exports a DecisionPacket/brief grounded in evidence:

- App/niche summary and target user.
- Six scores with confidence and SourceStatus.
- Evidence cards with links back to source Apps, Reviews, Keywords, and
  Snapshots.
- Blueprint: MVP, constraints, tech stack, risks, and validation plan.
- Handoff format for external builders.

Kittie can later add a lightweight web/Expo preview, but not a self-hosted
native runtime. The product promise is better market judgment, not owning the
compiler.

## Paid/free source reality

Free Store and public-web sources are enough for v1 if we label estimates
honestly. Paid vendors may improve calibration later, but should not become the
core dependency.

Current stance:

- Use free leading signals first where access is reliable.
- Add Play install buckets as the first real-install calibration source.
- Keep Meta ads as a lagging signal until verification is unblocked.
- Treat paid download/revenue feeds as optional calibration, not product truth.

## Next slices

[#168](https://github.com/ree1ezixxx/open-source-app-kittie/issues/168) should
ship as tracer-bullet slices: contracts, confidence scorer, review pain clusters,
Play install bucket calibration, audit aggregator, and brief export.
