# Stop Conditions — simulator-autobuild

Hard stops. When any is hit: stop the loop, write
`.ai/loops/simulator-autobuild/FINAL_STATUS.md` (what happened, why stopped,
exact state, recommended next action), and report to Rhodri.

Stop if:

- same error repeats 3 times
- build system cannot be identified
- dependency install requires auth/private registry
- action requires secrets
- action requires `.env` edits
- action requires production deployment
- action requires Apple/Google credentials
- action would push to main
- action would delete large directories
- action would overwrite user work (uncommitted changes from other streams — never blanket `git restore .`)
- implementation requires a major architecture rewrite

Repo-specific additions:

- never touch `data/kittie.db` destructively (upsert-only world)
- never `npm install` at the platform level (pnpm only; generated workspaces are exempt)
- 10 iterations per run max; 5 repair attempts per failure max
- if Chrome DevTools MCP or the dev servers stall repeatedly (blank tool results), stop and flag — do not retry-storm (per global CLAUDE.md)
