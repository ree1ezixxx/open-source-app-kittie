# PRD - Trending Ideas Redesign

**Epic:** [#168 Audit Engine - app decision layer](https://github.com/ree1ezixxx/open-source-app-kittie/issues/168)
**Strategy:** [AppKittie Intelligence Layer](../strategy/appkittie-intelligence-layer.md)
**Decision record:** [ADR 0012](../adr/0012-own-intelligence-evidence-outcome-loop.md)

## Summary

Redesign Trending from a chart table into the first module of the Audit Engine:
idea-first, evidence-backed, and brief-exportable.

The page should answer: "What app opportunity should I build, why now, how
confident are we, and what evidence supports it?"

## Goals

- Surface Hot ideas and fast-moving niches before users need to inspect raw
  chart rows.
- Make every recommendation traceable to evidence cards.
- Show confidence and missing-source status honestly.
- Export a build-ready brief for external coding harnesses.
- Keep Trending as a module inside the Audit Engine, not a standalone growth
  table.

## Non-goals

- No self-hosted iOS Simulator, Xcode cloud, or native build runtime.
- No paid-data dependency for v1.
- No fabricated Meta ads, install counts, or social evidence.
- No per-view LLM generation for list rows.

## User flow

1. User opens Trending Ideas.
2. The page shows ranked opportunities, not just Apps.
3. Each row/card names the source App or niche, six-score summary, confidence,
   and top evidence.
4. User opens an opportunity detail.
5. Detail shows the source App, competing Apps, Review pain, Keyword signals,
   Snapshot movement, Listing media, monetisation evidence, and SourceStatus.
6. User exports a build brief to Codex, Claude Code, Rork, Bolt, or another
   builder.

## Information architecture

- **Opportunity feed** - sorted by overall Audit score, with filters for Store,
  Chart country, category, Growth period, buildability, and source coverage.
- **Evidence stack** - cards for Reviews, Keywords, Snapshots, chart movement,
  Listing media, IAPs, and external leading signals when present.
- **Score panel** - six sub-scores plus confidence.
- **Blueprint panel** - MVP, V2, tech stack, services, difficulty, timeline,
  risks, and validation plan.
- **Export panel** - build-ready DecisionPacket.

## Data contract

The frontend should eventually read an `AuditReport`:

- `app` or `niche`
- six sub-scores
- `confidence`
- `sourceStatus`
- `evidenceCards[]`
- `competitors[]`
- `reviewPainClusters[]`
- `blueprint`
- `briefExport`

Missing data is represented by `SourceStatus` and confidence, not by fake rows
or zeroed scores.

## Scoring expectations

- Growth uses Snapshot deltas inside the selected Growth period.
- Demand can include leading evidence when available.
- Pain requires written Review text, not rating-only Reviews.
- Competition uses competitor count, incumbent strength, and Keyword difficulty.
- Monetisation uses Revenue estimate and direct pricing/IAP evidence.
- Buildability comes from the Blueprint and required capabilities.

## Acceptance criteria for later implementation

- Feed is idea-first and evidence-backed.
- Every score links to evidence cards.
- Missing sources visibly lower confidence.
- Export brief contains the same evidence shown in the UI.
- Trending chart data remains available as supporting evidence.
- No runtime ownership is implied in UI copy.
