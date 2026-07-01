# 0012 - Own the intelligence, evidence, and outcome loop

## Status

Accepted

## Context

[Epic #168](https://github.com/ree1ezixxx/open-source-app-kittie/issues/168)
pivots AppKittie from an app trend dashboard into an **app decision layer**:
search an App or category, diagnose the opportunity, trace every claim to
evidence cards, and export a build-ready brief.

The tempting alternative is a "clone button" product that owns the build runtime:
hosted iOS Simulator, Xcode cloud, sandboxed preview, and generation surface.
That layer is crowded, expensive, and less defensible than the market
intelligence Kittie is already collecting. Public Store data, Snapshots, Review
history, Keyword intelligence, Listing media, and later outcome feedback compound
inside Kittie. Build runtimes can be routed to.

See the strategy doc: [AppKittie Intelligence Layer](../strategy/appkittie-intelligence-layer.md).
The originating product spec is [Trending Ideas Redesign](../prd/trending-ideas-redesign.md).

## Decision

AppKittie owns the **intelligence, evidence, and outcome loop**. It does not own
the native build runtime.

The Audit Engine should produce:

- an `AuditReport` with six visible sub-scores and confidence;
- evidence cards for every material claim;
- `SourceStatus` for missing, stale, partial, or observed data;
- a build-ready brief/DecisionPacket for external coding harnesses;
- a later outcome loop that records which briefs were built, shipped, and
  worked.

The build action is a handoff to Codex, Claude Code, Rork, Bolt, or similar
tools. A lightweight web/Expo preview can be added later as presentation, but
self-hosted native runtime infrastructure is out of scope.

## Consequences

- Product differentiation sits in market judgment, provenance, confidence, and
  longitudinal data, not in owning a compiler or simulator.
- Leading signals are treated as evidence for "why now"; lagging sources are
  calibration for Estimated metrics.
- Missing sources lower confidence instead of becoming zero-valued scores.
- The Trending Ideas redesign becomes a module inside the Audit Engine, not a
  separate trend-table replacement.
- Later implementation slices should prioritize contracts, confidence scoring,
  Review pain clusters, Play install bucket calibration, audit aggregation, and
  brief export.

## Alternatives considered

- **Own a hosted iOS Simulator/Xcode runtime.** Rejected. High operational cost,
  Apple/Mac infrastructure complexity, crowded competition, and weak connection
  to Kittie's data moat.
- **Stay a trend dashboard.** Rejected. Useful for browsing, but it does not
  answer the builder's real question: what to build and why.
- **Buy paid download/revenue truth first.** Deferred. Paid feeds may calibrate
  estimates later, but v1 can use free leading evidence plus public Store facts
  if provenance and confidence are explicit.
- **Generate ideas without evidence.** Rejected. It would be a thin ideation
  layer. Every recommendation must trace back to observed or clearly modelled
  evidence.
