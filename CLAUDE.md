# CLAUDE.md

Read `AGENTS.md` first — it's the source of truth for this repo.

## Communication (enforced default)

- **Concise and direct.** Lead with the answer. No preamble, no recap.
- **Hard default: ≤6 lines.** Most replies are 1–3 sentences or a few bullets.
- **No filler, no multi-section reports** unless asked. Conclusion first; detail on request.
- **State findings once.** No closing recaps. End on the next action or a question.
- **Match length to the question.**

Full rules: see `AGENTS.md` → Communication.

## Browser tabs (Chrome DevTools MCP)

- **Whenever you open/show a localhost tab, rename its title to the clone's sidebar label** (e.g. Organic, Ads, Highlights) for clean per-port separation.
- Right after navigating, run: `evaluate_script(() => { document.title = "<Section>"; })`.
- Map: this worktree = **Organic** (web :5175 / api :3018). Each worktree uses its own section name + ports.
