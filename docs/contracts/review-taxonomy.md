# Review Taxonomy v2 (#272)

The classifier's label sets (`packages/intelligence/src/reviewClassifier.ts`)
and this rationale are one contract — change them together, then run
`pnpm ingest:retag`.

## Design rule

A label earns its place only if a product team can ACT on it. v1 named generic
surfaces ("Features", "User Interface", "App Performance") — true but inert:
knowing 30% of reviews mention "Features" decides nothing. v2 improvement-areas
name the decision ("Trial & Billing Deception", "Notification Fatigue",
"Missing Export & Portability"): each maps to a concrete backlog item, and the
ladder's `find_feature_gaps` demand-linkage and `rank_whitespace_ideas` build
angles inherit that specificity.

Two dimensions, unchanged contract (`ClassifiableReview → ReviewTags`):
- **topics** — what the review is ABOUT (14 descriptive surfaces; navigation,
  filtering, and the praise-flip in `cluster_reviews` handle valence).
- **improvementAreas** — what the app should FIX (16 decision labels;
  deliberately precision-first, phrase-heavy keywords, because a false "Trial &
  Billing Deception" tag is worse than a missed one).

## Improvement-area labels (the decision set)

| Label | Definition — fires when the review describes… | Example |
|---|---|---|
| Ad Intrusiveness | ad frequency/placement damaging use, not ads existing | "an ad after every single round" |
| Subscription Lock-In | value moved behind payment; resentment at gating | "everything is paywalled now, used to be free" |
| Trial & Billing Deception | unexpected/hard-to-stop charges; cancellation traps | "cancelled but they kept charging me" |
| Refund Friction | refusal/difficulty returning money | "support denied my refund twice" |
| Accuracy Failure | the core function producing wrong results | "step count is wildly inaccurate" |
| Crash & Data Loss | crashes, corrupted/lost user data or progress | "update wiped 300 days of streaks" |
| Performance Drag | slowness/battery cost short of crashing | "takes forever to load a lesson" |
| Onboarding Confusion | can't get started/understand setup | "no instructions, couldn't figure out setup" |
| Navigation & Usability | can't find/reach things; clutter | "settings are buried in menus" |
| Notification Fatigue | volume/tone of notifications drives users away | "the guilt-trip reminders are unbearable" |
| Missing Export & Portability | can't get data out/in | "no CSV export after years of data" |
| Sync Reliability | multi-device/cloud state breaking | "never syncs with my iPad" |
| Support Unresponsiveness | contact attempts going nowhere | "three tickets, only bot replies" |
| Privacy Anxiety | distrust over data collection/permissions | "why does it need my contacts?" |
| Content Gaps | not enough / repetitive / stale content | "ran out of levels in a week" |
| Account Recovery Trouble | locked out with no path back | "reset email never arrives, account gone" |

Topic labels are broader on purpose (recall-first): they power feeds/filters,
while improvement-areas power decisions.

## Known limits (accepted, documented)

- **Negation/valence not modeled** (cold-verify F1): "finally an ad-free tier"
  can tag Ads Experience. The `cluster_reviews` praise-flip (sentiment ≥ 0.4)
  re-types such themes; the LLM classifier swap is the real fix.
- Keyword heuristic ≈ precision over recall for improvement-areas; the
  LLM-at-ingest swap keeps this exact contract.
- English-only keywords — locale handling is #268.

## Migration

`MIGRATION_MAP` (exported) translates v1 labels → absorbing v2 label(s) for
longitudinal comparisons. The re-tag sweep (`pnpm ingest:retag`) rewrites the
stored corpus; run it in the same deploy as any taxonomy change.
