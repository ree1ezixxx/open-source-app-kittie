# 0012 — Audit engine: own the intelligence layer, not the build runtime

## Status

Accepted

## Context

The product is pivoting from a trend dashboard toward an **app decision engine**:
search an app/category → diagnose the opportunity → export a build-ready brief
(epic #168, [strategy](../strategy/appkittie-intelligence-layer.md)).

That raises a fork. A "clone button" is high-leverage: it closes the loop from
*insight* to *running app* and is the demo that sells. Tools like Rork, Emergent,
Bolt, Lovable, v0 prove demand for "prompt → app". The temptation is to build our
own sandbox — ideally a native iOS/Xcode simulator — so we deliver both the idea
*and* the build.

Two forces push back:

1. The build-runtime layer is the most crowded and capital-intensive in the
   space, and its moat is **rented** (the underlying model). Competing there means
   being a worse-funded copy of funded incumbents.
2. Real iOS-in-Xcode-sim at scale is a Mac/Apple-licensing infrastructure sink.
   (Rork itself uses Expo/RN + web preview + EAS, not a true native sim farm.)

Meanwhile our actual edge — longitudinal market data, judgment, and an
idea→built→outcome loop — is upstream of the build and **compounds** with time.

## Decision

**Own the intelligence, evidence, and outcome loop. Do not own the build runtime.
The "clone button" is a spec handoff (+ optional web preview), never a hosted
device sandbox.**

1. **Product surface = the audit/brief**, grounded in real market evidence. The
   defensible artifact is *spec quality*, not a runtime.
2. **Clone button, tier 1 (now, capital-light):** export the evidence-backed spec
   as markdown / GitHub issues / agent prompts and hand off to Claude Code, Codex,
   Rork, Bolt — via copy/download/deep-link. Build-tool **agnostic**: we win
   whichever build tool wins, and can route to / partner with them rather than
   compete.
3. **Clone button, tier 2 (later, optional):** an embedded **web** Expo/RN preview
   (Expo Snack / WebContainers / StackBlitz) for a "see it running" moment — with
   no Mac infrastructure. Deferred behind a great export; only added if export
   alone proves insufficient, and only with honest framing (web preview ≠ shipped
   native app).
4. **Never:** a self-hosted Xcode / iOS-simulator cloud.
5. **Moat investment goes to data + judgment + outcome loop** — not UI, not
   runtime. Instrument `idea → exported → built → worked` from early on.

## Consequences

- We stay capital-light and focused on the one asset competitors can't quickly
  copy: compounding longitudinal data + the outcome feedback loop.
- We become **complementary** to build tools (and a routing layer over them)
  instead of a thin reskin of them.
- The brief generator (`build-context`) becomes a first-class, tested module
  (slice #175): `AuditReport → {markdown, issues, agent prompts, do-not-build}`.
- Value realisation partly happens off-platform (the build runs elsewhere). We
  accept this and capture value via the decision + the outcome loop, not the
  runtime. The outcome instrument is what prevents us from being a mere referral.
- If, later, build tools prove fully closed to external specs, the "route over
  them" thesis weakens and tier-2 preview rises in priority — revisit then.

## Alternatives considered

- **Own a native iOS-sim/Xcode build cloud** — wrong layer, highest cost, fighting
  funded incumbents on their turf; makes us *more* clonable, not less. No.
- **Idea/brief only, no clone affordance** — leaves a value-capture gap (user
  takes the brief and leaves); weak activation and retention. Rejected in favour
  of the export handoff.
- **Deep, exclusive integration with a single build tool (e.g. only Rork)** — ties
  our fate to one vendor and forfeits the agnostic routing advantage. Deferred;
  start with portable export.
