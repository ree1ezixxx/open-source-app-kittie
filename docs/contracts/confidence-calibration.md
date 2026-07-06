# Confidence Calibration (#273)

One documented model for every decision-ladder response's `confidence`. The
implementation is `calibrateConfidence` in
`packages/intelligence/src/confidence/`; the worked examples below MUST
reproduce its numbers (they are asserted in `confidence.test.ts`).

## Why

Before #273 each primitive invented its own arithmetic, so `0.72` meant nothing
transferable. Now confidence answers one question everywhere: **how much
audited evidence is this answer standing on?** — and it is reproducible from
the response's own `sourceCoverage` block (#271), so an agent can recompute and
audit it.

## The model (v1)

```
score = min(0.90, 0.35                    base — the primitive ran on real evidence
              + 0.30 · volume             evidenceUnits / evidenceTarget, capped at 1
              + 0.20 · spread             appsContributing / appsResolved
              + 0.05 · recency            fraction of evidence ≤ 180 days old (0 when dates unknown)
              + 0.05 · diversity          sourceTypesPresent / sourceTypesConsulted
              + 0.05 · llm                enrichment seam succeeded)
        − 0.10 · localeMismatch           requested market absent from localesSeen
rounded to 3 dp, floored at 0.05 when any evidence exists.
```

Labels keep the #180 thresholds: **high ≥ 0.75 · medium ≥ 0.6 · low > 0 ·
insufficient = 0**.

### Factor semantics

| Factor | Input | Movement | Cap/floor |
|---|---|---|---|
| volume | primary units analysed vs per-primitive target (reviews: 100) | more evidence → up | saturates at target |
| spread | apps contributing ≥1 unit vs apps resolved | broader corroboration → up | 1 app of 10 = 0.02 of 0.20 |
| recency | share of units ≤180d old | fresher → up | unknown dates → 0 (never guessed) |
| diversity | source types that contributed vs consulted | independent sources agreeing → up | single-source answers capped lower |
| llm | enrichment seam succeeded | labelled themes → +0.05 | failure/degrade → 0, never negative |
| locale mismatch | requested market ∉ `localesSeen` | −0.10 flat | unknown locales ≠ mismatch (no penalty) |

### Hard rules (property-tested)

1. **Zero primary evidence → `{score: 0, label: insufficient}`.** No exceptions;
   the floor applies only when evidence exists.
2. **Monotonicity:** more units never lowers the score; more contributing apps
   never lowers it; a locale mismatch never raises it.
3. **Ceiling 0.9** — a heuristic pipeline is never certain.
4. **Auditability:** every non-zero factor lands in `reasons` with its inputs;
   score is reproducible from `sourceCoverage`.
5. **`missing_source` caps still apply** — `buildIntelligenceResponse` caps the
   score (≤0.59 one missing source, ≤0.49 several) AFTER calibration. This
   model feeds that gate; it does not replace it.
6. **No path may emit `high` with a missing primary source** — follows from
   rules 1 and 5 (missing primary → cap 0.59 < 0.75).

## Worked examples (asserted in tests)

1. **Rich single-market cluster** — 100/100 reviews, 8/10 apps, 60% recent,
   1/1 source, no LLM, locale match:
   `0.35 + 0.30·1 + 0.20·0.8 + 0.05·0.6 + 0.05·1 + 0 = 0.89 → high`.
2. **Thin corpus** — 10/100 reviews, 1/10 apps, recency unknown, 1/1 source,
   no LLM: `0.35 + 0.03 + 0.02 + 0 + 0.05 = 0.45 → low`.
3. **Locale mismatch** — as (1) but requested `GB`, seen `["US"]`:
   `0.89 − 0.10 = 0.79 → high` (mismatch alone demotes but strong evidence can
   still clear the bar; the mismatch is named in `reasons` and callers may add
   caveats).
4. **Empty corpus** — 0 units → `0 / insufficient` regardless of other inputs.
5. **LLM lift** — as (2) plus successful enrichment: `0.45 + 0.05 = 0.50 → low`
   (enrichment polishes labels; it cannot rescue thin evidence into medium).

## Per-primitive wiring

- **cluster_reviews** — units = `totalReviewsAnalyzed` (target 100); spread from
  per-app coverage; recency computed from real review dates in the engine;
  sources consulted = reviews; locale = request country vs `localesSeen`.
- **find_feature_gaps** — units = `reviewsAnalyzed` (target 100) when review
  signals are on; sources consulted = reviews + listings, present counts each
  one that contributed. A reviews-off run stands on the listing corpus instead:
  units = apps with descriptions, target = apps resolved — and `reasons` says
  so explicitly ("standing on listings only").
- **rank_whitespace_ideas** — response-level: the primary evidence is the
  deep-analysed competitor set (units = distinct competitors, target 8);
  review grounding enters as spread (`appsWithReviews / appsResolved`) and
  diversity comes from the ideas' own evidence sources (reviews / features /
  charts / metadata, of 4). Ungrounded-but-real ideas therefore read LOW, not
  insufficient — refusal semantics belong to the gates ticket (#274). Per-idea
  `confidence` keeps its own idea-local formula and is out of scope here.

## Changing the model

Weights/targets live in `CONFIDENCE_MODEL`. Any change must update the worked
examples here AND the fixture tests in the same commit — the doc and the code
are one contract.
