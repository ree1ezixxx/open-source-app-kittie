/**
 * Roadmap — the per-venture founder-journey canvas. A fixed 7-stage template of
 * task nodes; each node is advanced by a `kind` (who acts) and carries a `state`.
 * Honesty rule: a `you` node is `done` only when the founder marks it; `agent`
 * and `kittie` node state is derived live from the real source, never faked.
 */

/** The 7 fixed, ordered stage columns, Idea → Scale. */
export type RoadmapStage =
  | "idea"
  | "initial"
  | "build"
  | "security"
  | "distribution"
  | "launch"
  | "scale";

/** Who advances a node: the founder, the Builder agent, or a Kittie surface. */
export type RoadmapNodeKind = "you" | "agent" | "kittie";

/** A node's progress. `done` on a `you` node is user-set; never fabricated. */
export type RoadmapNodeState = "todo" | "needs-you" | "in-progress" | "done";

/** A `you` node either captures a reflection/answer or is a manual check-off. */
export type RoadmapYouMode = "reflect" | "manual";

/** Which real Kittie surface a `kittie` node opens. */
export type RoadmapKittieTarget = "teardown" | "aso" | "growth";

/** One task on the roadmap. Identity is the stable `key`. */
export interface RoadmapNode {
  key: string;
  stage: RoadmapStage;
  kind: RoadmapNodeKind;
  title: string;
  subtitle?: string;
  /** Keys of nodes that should come first (advisory — dims, never hard-locks). */
  dependsOn: string[];
  state: RoadmapNodeState;
  /** Present on `you` nodes. */
  mode?: RoadmapYouMode;
  /** Present on `kittie` nodes. */
  target?: RoadmapKittieTarget;
}

/** The ordered stage spine + the resolved nodes for a venture. */
export interface RoadmapTemplate {
  stages: Array<{ id: RoadmapStage; label: string }>;
  nodes: RoadmapNode[];
}
