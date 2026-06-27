# AppKittie — the app decision layer (strategy)

**Status:** active · **Decided:** 2026-06-27 · **Epic:** #168
**Companion:** ADR [0012](../adr/0012-audit-engine-intelligence-over-runtime.md) · validated handoff `~/Documents/Claude/handoffs/2026-06-27-appkittie-data-layers-and-build-strategy.md`

## Positioning

AppKittie is **not** a generic "all app intelligence" dashboard. It is an **app decision engine**:

> Search any app or category → diagnose the opportunity → generate a build-ready plan, with evidence.

Product promise: *"Search any app or category. Get the teardown, proof, and build-ready roadmap."*

We own the **intelligence + evidence + outcome loop**. We do **not** own the build runtime (see ADR 0012). The "clone button" means *generate the spec, tickets, prompts, competitor evidence, and implementation brief* — not *run an iOS simulator in our cloud*.

## Why this is defensible (the moat)

A UI is trivially cloneable; a build runtime is rented (the model) and crowded. The compounding assets are:

1. **Longitudinal data** — daily snapshots of rank, metadata, screenshots, reviews, pricing, keyword position, app-to-app similarity. A competitor starting today is years behind.
2. **Judgment** — dedup, incumbent-filtering, turning noise into "build *this*, here's the proof."
3. **The outcome loop** — which briefs got built, shipped, and worked. No build tool or data vendor has `idea → built → succeeded` feedback. This is the long-term moat.

## Data philosophy

- **Backbone signals** (app-level truth): App Store/Play chart rank + movement, review count + rating velocity, IAP count, update/release cadence. These are real and already collected.
- **Leading signals are *evidence*, not truth.** Google Trends, TikTok, Reddit/X, Product Hunt/HN are used for "why now", category validation, pain language, and creative angles — **never** to assert app-level growth/revenue. Say *"supporting category demand is rising,"* not *"this app is exploding because Reddit mentions are up."*
- **Honesty contract** (repo rule): a missing source ⇒ **lower confidence, never scored 0**; all estimates are labelled modelled and traced via `Provenanced<T>` / `DecisionPacket`.

## The six-score model

Do not collapse everything into one magic "growth score". Compute separate, **visible** sub-scores and combine them transparently — two apps can both be "trending" while only one is worth a builder's time.

| Score | Question | Inputs |
|---|---|---|
| **Momentum** | Is this app moving? | review velocity, rank movement, update recency |
| **Demand** | Is the market/problem moving? | Google Trends, keyword trend, Reddit/TikTok/PH/HN mentions |
| **Pain** | Is there obvious user frustration? | review complaints, low-rating clusters, repeated feature requests |
| **Monetisation** | Is there money here? | IAP count, pricing, subscription presence, category ARPU |
| **Buildability** | Can an indie/agency ship a wedge fast? | feature complexity, asset burden, regulatory risk, platform dependency |
| **Confidence** | How reliable is this read? | source coverage, sample size, freshness, cross-signal agreement |

Every recommendation carries an **evidence stack** (traceable cards), never a bare "this is hot".

## Data-source priorities (free first, leading first)

**Now:** review mining (pain clusters) · Google Play install-bucket calibration (free, improves Apple-side estimates).
**Next:** Google Trends (category demand; API is alpha/restricted — apply, don't depend) · keyword popularity *over time* · screenshot/metadata change detection.
**Later:** Meta/TikTok ad libraries (evidence of positioning/creatives, not a growth weight) · paid feeds (Sensor Tower / data.ai / Appfigures) **only after customer validation**.
**Avoid early:** X (expensive/noisy at scale).

Source access reality (free vs paid, restrictions) is tracked per-source in the handoff §3 and re-validated before a source becomes core.

## Build-layer decision (summary)

Own the brain, rent the hands. The clone button ships as: (1) capital-light **handoff** — drop the evidence-backed spec into Claude Code / Codex / Rork / Bolt via export/deep-link; (2) optional web Expo preview later for the "see it running" moment. **Never** a self-hosted Xcode/iOS-sim cloud. Full rationale + alternatives in ADR 0012.

## Sequencing

Tracer-bullet slices under epic #168: contract+momentum (#170) → honest scoring (#171) → review pain-clusters (#172) → Play calibration (#173) → six-score panel (#174) → brief export (#175) → trending-as-module (#176). Integration branch `feat/audit-engine`; one squash PR → `main`.
