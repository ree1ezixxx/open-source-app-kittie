# Glossary fragment — Organic

Domain terms introduced by the Organic Content lane (`feat/organic`).
**Do not add these to root `CONTEXT.md`** — the coordinator merges fragments from `docs/glossary/*.md`
into canonical `CONTEXT.md` in a final consolidation pass (keeps feature branches conflict-free).
Format matches the `## Language` section of `CONTEXT.md` (`**Term**:` / definition / `_Avoid_:`).

**Organic content**:
The dashboard surface (`/dashboard/organic`) listing Apps that have creator videos. App-grouped: one card per App, carrying its store metrics, a Listing media screenshot strip, a **VIDEOS** count, and a carousel of Organic videos. The organic counterpart to the Ads Library — same page shell, creator videos in place of paid Ad creatives.
_Avoid_: Organic ads (contradiction — organic is *not* paid); UGC page

**Organic video**:
A creator/UGC short video promoting an App, attributed to a creator `@handle` (the public account of a [[#Creator partnership]]). Sourced from social platforms (TikTok, Instagram, etc.), never a paid placement. Distinct from **Ad creative** (Meta-paid) and **Listing media** (the App's *own* store assets). Stored in `organic_videos`; the `@handle` + `platform` are denormalized on the row (the `creators` table tracks the account itself — a [[#Creator partnership]] — but v1 organic_videos doesn't FK it). The card's **VIDEOS** metric is the count of Organic videos linked to that App.
_Avoid_: Ad creative (that is paid Meta); Listing media (the App's own preview); UGC creative
