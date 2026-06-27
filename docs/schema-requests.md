# Schema Change Requests

Sessions 2 and 3: if you need a schema change, add a row here. Session 1 applies it.

| Date | Requester | Change | Status |
|------|-----------|--------|--------|
| 2026-06-27 | audit-engine #172 | Store raw review **text** + rating + version window per app (pain-cluster mining), not just review counts | requested |
| 2026-06-27 | audit-engine #173 | Capture Google Play **install buckets** (e.g. `1M+`), IAP/subscription flags + category for calibration | requested |
| 2026-06-27 | audit-engine #171 | Persist per-signal `source_status` (`available`/`partial`/`unavailable`) so missing data lowers confidence, never scored 0 | requested |
