# Intelligence Response Contracts

Issue #180 locks the first shared contract layer for intelligence outputs. API,
CLI, MCP, reports, and web surfaces can add response-specific `data`, but every
intelligence response must use the same envelope:

- `responseType` - `app_detail`, `compare_apps`, `trends`, `idea_validation`,
  `teardown`, `similar`, `review_clusters`, or `report`
- `status` - `ok`, `partial`, or `insufficient`
- `data` - response-specific payload
- `evidence[]` - claim, source identity, observed/modelled status, freshness,
  and optional metric
- `confidence` - 0..1 score, label, and reasons
- `caveats[]` - missing, partial, stale, weak, or Estimated-metric warnings
- `metadata` - contract version, generated time, source query, snapshot/country,
  growth period, and model version

Report outputs use `IntelligenceReportContract`: template, format, status,
source query, evidence snapshot, output, and output metadata.

## Envelope placement (canonical)

Every app-intelligence HTTP route returns the envelope nested under a single
outer `data` key:

```jsonc
// GET/POST /api/v1/app-intelligence/*  →
{ "data": { "responseType": "...", "status": "...", "data": { /* payload */ },
            "evidence": [], "confidence": {}, "caveats": [], "metadata": {} } }
```

`app_detail`, `compare_apps`, `idea_validation`, `teardown`, `similar`, and
`review_clusters` all follow this. The web client's `tryLive` strips exactly that one outer level and
hands surfaces the full envelope; `envelope.data` is the response-specific
payload. Wrapping helpers for non-envelope-native services (DecisionPacket
confidence/evidence, ranked competitors, named missing inputs) live in
`packages/api/src/services/intelligence-envelope.ts`.

**Known deviation:** the `/trends` route returns the envelope at the top level
(not under `data`). Aligning it is a follow-up — it would change the CLI, MCP,
reports, and web trends consumers, so it is deliberately out of scope for the
teardown/similar conformance change (#247).

For `teardown` and `similar`, the envelope `confidence` is the shared value and
is subject to the standard missing-source cap; each service's own
pre-cap confidence stays verbatim inside `envelope.data`
(`data.decisionPacket.confidence` / `data.confidence`), so no underlying value is
lost.

## Honesty Rules

Estimated metrics are directional model outputs, not Store truth. Revenue
estimate, Download estimate, and Growth score must be represented as
`valueKind: "modelled"` evidence and must carry an `estimated_metric` caveat
when material to the response. Do not label them as Apple or Google reported
metrics.

Missing sources lower confidence. If Meta ads, Apple Search Ads, creator data,
reviews, keywords, or any other expected source is absent, the response should
add a `missing_source` or `partial_source` caveat and return `status: "partial"`
or `status: "insufficient"` as appropriate. Do not emit fake zero-value evidence
for a source that was not ingested.

Observed evidence cites a source URL when URL-addressable. Modelled, derived,
and inferred evidence can use `url: null`, but must still name the source id and
model/transform version in metadata where relevant.

## Fixtures

Typed fixtures live in
`packages/types/src/intelligence-response.fixtures.ts`:

- `appDetailResponseExample`
- `trendsResponseExample`
- `ideaValidationResponseExample`
- `reportResponseExample`

Runtime invariants live in `packages/intelligence/src/intelligence-response.ts`.
