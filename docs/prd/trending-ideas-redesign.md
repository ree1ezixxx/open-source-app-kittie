# PRD — Trending Ideas Redesign (originating)

**Date:** 2026-06-27 · **Epic:** #168
**Companions:** [strategy](../strategy/appkittie-intelligence-layer.md) · ADR [0012](../adr/0012-audit-engine-intelligence-over-runtime.md)

> **Note on evolution.** This is the originating PRD that kicked off the redesign. It has since been
> sharpened (see strategy doc): the product leads with an **app/category audit engine**, and the
> "Trending Ideas" surface becomes a **module inside** that engine rather than the lead. The visual
> direction, idea-detail structure, and agent-export goals below remain the canonical spec; read it
> alongside the strategy doc, which supersedes the "lead with Trending" framing.

---

## 1. Product thesis

AppKittie should not feel like a traditional app analytics dashboard. It should feel like a live
app-market intelligence feed that shows builders what apps are trending, why they are working, and how
to turn those patterns into agent-ready build briefs. Users do not primarily want raw data — they want
usable app ideas. Data exists underneath; the default UI surfaces interpreted opportunities.

## 2. Core value proposition

Answer four questions: (1) what apps are trending now, (2) why, (3) what buildable idea can I extract,
(4) can I send this straight into Claude Code / Codex / another harness? Compress messy app-store,
keyword, review, revenue, ad and competitor signals into one output: *"build this, here's why, here's
the evidence, here's the agent prompt."*

## 3. Target users

Primary: AI-native app builders (solo builders, indie hackers, coding-agent users, portfolio builders,
prompt-to-app developers, small studios) who want app ideas backed by market evidence.
Secondary consumer: the coding agent — it needs structured data (JSON, MCP tools, CLI, build briefs,
teardown summaries, competitor context, screen/feature specs).

## 4. Main product decision

Move away from the multi-page analytics dashboard. Don't lead with a left sidebar, 20+ routes, raw
tables, rankings, charts, scattered filters. Lead with **Trending Ideas**. Data-heavy pages can stay
later; v1 focuses on one high-value surface.

## 5. V1 shape — Trending Ideas

A single primary page showing trending app opportunities by category. Category filters: All · Health ·
Utility · Photo & Video · Productivity · Finance · Education · Games · Lifestyle · Sports · AI ·
Creator Tools. Each category contains trending apps + extracted build ideas. Visual, fast, browseable.

## 6. Visual direction

Adapt the reference's horizontal rows of mobile screens into **horizontal logo/app carousels**. Instead
of long vertical tables, show category rows of app logos. Rows alternate scroll direction (row 1 L→R,
row 2 R→L, …) for a lively "market pulse" feel — a live wall of app-market movement, not a spreadsheet
with prettier cards.

## 7. Homepage layout

- **Top:** hero — *"Find what app to build next. Live app-store signals turned into build-ready ideas
  for AI builders."* Primary actions: Browse trending ideas · Generate build brief · Ask via MCP.
  Optional search.
- **Body:** category carousel rows. Each row: tagline (e.g. "Health is moving"), a pulse line
  ("12 rising apps · 4 strong subscription signals · 7 review-pain clusters"), and a logo carousel. Each
  tile: icon, name, small trend indicator, category, one-line reason.

## 8. App / Idea detail page

Clicking an app or trend opens a breakdown that answers *"what can I build from this?"* — not just
"here is the app's data." Structure:

1. **Summary** — opportunity title, confidence score, category, build difficulty, freshness,
   monetization potential.
2. **Why this is trending** — interpreted reasons (downloads, revenue signal, reviews, keyword demand,
   competitor movement, ad activity, recent updates, category timing), readable.
3. **Source apps** — visual app cards (icon, name, category, downloads est, revenue est, rating, trend
   reason, "open teardown"), not a raw table.
4. **Teardown canvas** — keep the existing canvas as the premium visual explanation layer (Growth,
   Acquisition, Discovery, Stack, Voice, Competitors, Monetization, Reviews, Keywords), plus a
   **Build Angles** section: what can be *extracted* from the app, not just an explanation of it.
5. **Estimated stack** — LLM-interpreted likely build stack, marked **estimated, not factual** unless
   verified.
6. **What to copy** — direct, practical (fast onboarding, visual-first interaction, clear subscription
   moment, narrow use case, simple daily loop).
7. **What not to copy** — prevent naive cloning (broad feature surface, expensive AI before validation,
   overloaded dashboard, unclear retention loop).
8. **Buildable wedge** — the key output: a crisp, narrow, shippable wedge.
9. **Agent build brief** — one-click export: Clone into Harness · Send to Claude Code · Send to Codex ·
   Copy MCP call · Export JSON. Brief includes idea, target user, MVP scope, screens, core loop, data
   model, visual direction, competitors, monetization, risks, implementation prompt.

## 9. Agent / MCP layer

UI is for humans; the structured layer is for agents. MCP/CLI tools:
`kittie.get_trending_ideas`, `get_trending_apps`, `get_app_teardown`, `get_category_pulse`,
`get_review_pain_points`, `get_keyword_clusters`, `generate_build_brief`, `validate_app_idea`,
`export_agent_prompt`. Example CLI: `kittie ideas --category health --window 7d`,
`kittie teardown impulse --format brief`, `kittie build-brief "AI meal photo journal" --target
claude-code`, `kittie validate "sobriety urge mode app"`.

## 10. Data philosophy

Data is present but hidden behind interpretation. Default view: Idea → Why now → Evidence → Build brief.
Secondary evidence view: Downloads · Revenue · Reviews · Ads · Keywords · Competitors · Rank movement.
Raw data reachable via evidence drawer, source app cards, advanced filters, CLI, MCP, JSON export. Don't
force normal users through data tables first.

## 11. Filters

Light and contextual — no permanent heavy left sidebar for v1. Category, Momentum, Revenue, Build
difficulty, Monetization type, Platform, Freshness, Agent-ready only. Open in a drawer/popover.

## 12. Information architecture

V1: Trending Ideas → category carousel rows → app/logo tiles → idea detail → app teardown → evidence
drawer → build brief export. Deprioritized for v1 (can exist later, must not dominate): full Explore
table, multiple dashboard pages, heavy sidebar, standalone Reviews / Ads Library / Keyword Explorer /
Roadmap pages, dense charts.

## 13. Key UX principle

The user should never feel *"I have to analyze this data myself."* They should feel *"AppKittie has
already found the market signal and converted it into something I can build."*

## 14. MVP build scope

1. Trending Ideas homepage (hero, category filters, horizontal carousels, market-pulse layout, cards).
2. Idea detail page (summary, why now, evidence apps, buildable wedge, estimated stack, copy/avoid,
   agent brief CTA).
3. App teardown view (existing canvas reused, cleaner hierarchy, build-angle layer added).
4. Agent export (copy prompt, export JSON, clone-into-harness placeholder, MCP call display).

## 15. Success criteria

Within 10 seconds of landing, a user understands: (1) what categories are moving, (2) which ideas are
worth exploring, (3) why those ideas are evidence-backed, (4) how to turn one into an agent-ready build.
Less "app analytics," more "a live idea engine for AI app builders."
