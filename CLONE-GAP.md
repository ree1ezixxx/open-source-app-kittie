# CLONE-GAP — Dashboard Highlights (`/dashboard/highlights`)
_QA pass 2026-06-15 · coordinator · clone `:5176` (HEAD 1f4c108) vs truth `appkittie.com/dashboard/highlights`_

**Verdict: needs-work (excellent build — minor parity only).** Nearly everything from the handoff is done and correct:
- ✅ Two independent **Select Apple Store / Select Google Play** toggles, default unpressed = all stores.
- ✅ Count badge on New Big Hits.
- ✅ View-all targets all correct: New Big Hits → `explore?sortBy=reviews&sortOrder=desc&releasedAfter=7d`; Top Gainers → `/dashboard/rising`; Top Losers → `/dashboard/movers?type=losers`.
- ✅ **Top Gainers / Top Losers render real signed integer rank deltas** (`+98`, `-94`) — a 2nd snapshot day was seeded, resolving the capability gap. Format matches truth (no percentages).
- ✅ Row sub-line is **category**; DL/MRR formatting matches truth incl. **`$<100`**; per-app metrics present.
- ✅ Hygiene clean: glossary terms in `docs/glossary/highlights.md`, root `CONTEXT.md` untouched, branch `feat/highlights`. **This is the correct pattern — keep it.**

## Structure
- [ ] **Missing column-header rows.** Truth prints a label row inside each widget: New Big Hits = `RK · NAME · DL · MRR`; Top Gainers / Top Losers = `RK · 1D · NAME · DL · MRR`. Clone renders the data rows but no header row in any widget. Add the column-label header row to each widget (with `1D` only on Gainers/Losers).
- [ ] **Page title isn't a real heading.** Truth renders `Dashboard Highlights` as `<h2>` (`heading level=2`); clone renders it as plain `StaticText`. Make it an `<h2>`.

## Data shape
- [ ] **Rank missing `#` prefix.** Truth shows `#1`, `#2`… (a `#` glyph before the rank number); clone shows just `1`, `2`. Add the `#` prefix in all three widgets.
- [ ] **(minor) Count badge placement.** Truth renders the count as siblings after the title — `New Big Hits` then `( 5,927 )`; clone bakes it into the heading text (`New Big Hits (13)`). Visually equivalent; align only if you want exact structural parity.

## Observations (no action — honest data delta)
- Count value differs by dataset: clone `New Big Hits (13)` vs truth `(5,927)`; DL/MRR skew low (`<100` / `$<100`) because the seed is small. Expected — not a bug.

_No hygiene issues this pass._
