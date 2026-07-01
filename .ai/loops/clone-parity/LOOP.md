# Autonomous Loop — clone-parity

Source of truth: `https://www.appkittie.com` (Chrome :9222, `coordinator/truth-chrome.sh`).
Clone: `http://127.0.0.1:5173` (API :3008).
Entry command: `/goal <outcome>` → `.cursor/skills/goal/SKILL.md`.

## The loop

```text
scope goal + truth path + clone path
  → inspect truth (Chrome DevTools MCP, tab 1)
  → inspect clone (same browser, tab 2 — never mix URLs on truth tab)
  → score fidelity /5
  → if ≥4/5: stop
  → else: smallest fix → pnpm typecheck → reload clone → re-score
  → continue (dynamic loop wake)
```

## Limits

| Limit | Value |
|---|---|
| Max iterations per run | 10 |
| Max repair attempts per failure | 5 |
| Stop if same error repeats | 3 times |
| Minimum shippable fidelity | 4/5 |

## Checks per iteration

- Truth page loads and is interactive (not login wall)
- Clone route loads; table/controls render
- `curl http://localhost:3008/health` → `{ok:true}`
- `pnpm typecheck` after code changes
- Fidelity score stated explicitly each pass

## Repo invariants

- **pnpm** only; canonical ports 3008/5173 unless HANDOFF says otherwise
- Truth browser is read-only navigation — compare, don't scrape private data
- Honest empty-states when ingest blocked (Meta ads, etc.)
