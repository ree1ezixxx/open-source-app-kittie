# Command — /simulator-loop-rip

The reusable autonomous-loop command for this repo.

## Meaning

```text
Read docs/simulator-first-builder-prd.md
Read .ai/loops/simulator-autobuild/LOOP.md
Read .ai/loops/simulator-autobuild/ROADMAP.md
Read .ai/loops/simulator-autobuild/STATUS.md
Read .ai/loops/simulator-autobuild/STOP_CONDITIONS.md

Then autonomously implement the next milestone on branch feat/simulator-first-builder.
Continue for up to 10 iterations unless a stop condition occurs.
Document every iteration (iteration-XXX.md).
Update STATUS.md after every iteration.
Commit safe checkpoints when checks pass.
```

## Model routing (Rhodri's token policy)

- **Orchestration runs on the main-session model (Fable):** reading state,
  picking the milestone slice, reviewing subagent output, updating STATUS.md,
  committing checkpoints.
- **Implementation executes on Opus subagents:** spawn via the Agent tool with
  `model: "opus"` for each implementation slice (code writing, debugging,
  build-fixing). Subagents return summaries + changed-file lists, never raw
  file dumps.
- Haiku subagents only for text-heavy research (docs/web), never code.

## Reference loop

Rork is the comparison target. A Chrome tab on rork.com is usually already
open — attach with chrome-devtools MCP (`list_pages` → `select_page`); never
open a duplicate tab. Use it to compare workspace behaviour (run timeline,
simulator states, inspector) whenever a milestone needs a fidelity check.
