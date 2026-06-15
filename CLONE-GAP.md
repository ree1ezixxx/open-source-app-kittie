# CLONE-GAP — Organic Content (`/dashboard/organic`)
_QA pass 2026-06-15 · coordinator · clone `:5175` (HEAD 43c8653) vs truth `appkittie.com/dashboard/organic`_

**Verdict: needs-work (strong build, minor parity + 1 hygiene flag).** The hard parts are done and correct: app-grouped cards, per-app metrics (rating · REVIEWS · REVENUE · INSTALLS · RELEASED · **VIDEOS**), the creator-video carousel with `Open organic video from @handle` + captions, the `Scroll organic videos right` control, `Open app` links, and the `Browse apps with creator videos` subtitle. Remaining items are small.

## ⚠ Hygiene — RESOLVED by coordinator (commit `55b3dc1`)
- [x] **Root `CONTEXT.md` contamination fixed.** The coordinator moved `**Organic content**` and `**Organic video**` out of root `CONTEXT.md` into **`docs/glossary/organic.md`** and reverted root `CONTEXT.md` to base. Your in-progress files were left untouched.
  - **Going forward:** add any new domain terms to `docs/glossary/organic.md` only — never root `CONTEXT.md`. The fragment header explains the rule. The coordinator consolidates fragments into canonical `CONTEXT.md` in a final pass.

## Structure
- [ ] **Page title isn't a real heading.** Truth renders `Organic Content` as `<h1>` (`heading level=1`); clone renders it as plain `StaticText`. Make it an `<h1>` to match (a11y + structure parity).
- [ ] **Filter rail header missing.** Truth has `Filters` (`<h2>`) + a **"Clear all"** button (disabled until a filter is set) above the filter groups. Clone has neither — add both.
- [ ] **Stray `20` near the header.** Clone emits a loose `StaticText "20"` right after the subtitle (the app count leaking into the header area). Remove it / fold it into the count line.

## Data shape
- [ ] **Pagination labels.** Clone uses `Previous page` / `Next page` and a bare `x / y`; truth uses **`Prev`** / **`Next`** with an explicit **`Page x / y`** (the word "Page"). Match truth.
- [ ] **Search placeholder.** Clone `Search apps…` → truth **`Search apps`** (no ellipsis).

## Observations (no action — honest data delta)
- Count line: clone `Showing 12 of 20 apps` vs truth `Showing 12 of 37.5K apps`. Expected seed-size difference (20 organic apps seeded) — not a bug.
- Clone adds a `Toggle theme` button in the page topbar; harmless extra.

_Hygiene branch/tree: on `feat/organic`, tree clean (committed). Only flag is the root `CONTEXT.md` edit above._
