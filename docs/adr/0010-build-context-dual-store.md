# 0010 — Build Context: one concept, two storage adapters

## Status

Accepted

## Context

A **Build Context** (CONTEXT.md) is the portable project-memory a coding-AI keeps
about one project — idea, audience, markets, monetisation, constraints, phase,
decisions, evidence, unknowns. It is defined as living in a `.kittie/` folder
**inside the user's own repo**, so any agent that opens the repo inherits it.

The web "Build Decision Workspace" (Slice 1) lets a human start from kittie.com
with **no repo yet**. Their idea/profile/phase/decisions have to persist
*somewhere* server-side. The naive move — a separate web `projects` table with
its own repository — creates a second concept that is ~90% identical to Build
Context, and a second place decisions are recorded. That is exactly the
"one decision layer, never forked" risk we set out to avoid, pushed down into the
data model. The glossary already warns: _avoid "project" (unqualified)_.

## Decision

**A Build Context is one concept with two storage adapters. The web "project"
*is* a Build Context, persisted in Kittie's store instead of in files.**

- Introduce a `BuildContextStore` seam in `@kittie/build-context`: read/write
  context, append decision, read decisions, read/write the market lock & plans.
- Two adapters implement it: **FsStore** (today's atomic `.kittie/` file I/O — the
  agent surface, in the user's repo) and **DbStore** (new — a `build_contexts`
  table + a decisions log, the web surface for users with no repo).
- `BuildContextManager` is refactored to depend on the store interface, not on
  `node:fs` directly. Its tested behaviour (create/update merge, digest,
  preference merge, append-only decisions) is unchanged and pins both adapters.
- The **agent handoff renders a DB-stored Build Context back into `.kittie/`
  files**, so a web builder's context becomes the exact portable artifact an
  agent inherits once pasted into a repo. Web and agent meet at one artifact.

## Consequences

- **One decision layer holds in storage too** — web and agent record/read
  decisions through the same manager, so they can never disagree.
- `manager.ts` / `io.ts` move off direct `node:fs`; the existing build-context
  tests become the behaviour contract both adapters must satisfy (DbStore is
  tested against the same expectations as FsStore).
- **Portability is preserved without a repo:** the web doesn't break the
  `.kittie/` promise — it defers it to export time (the handoff).
- The DbStore is the foundation a future authenticated web-account ↔ MCP live
  sync builds on (deferred, depends on auth — #100). Until then the bridge is the
  exported `.kittie/` folder.

## Alternatives considered

- **Separate web `Project` entity + table** — clean isolation, but two near-identical
  concepts and two decision logs; the fork we explicitly rejected. No.
- **Keep Build Context file-only, require a repo** — web users start with no repo;
  forcing one to get a verdict defeats the "simple web front door". No.
- **Stuff web state into the existing `builder_projects` table** — that table is the
  Rork-style code-gen builder (prompt → generated files), a different concern from
  market-decision memory; overloading it conflates two domains. No.
