/**
 * Harness domain types — Lane L13 (#101).
 *
 * Kittie is the market-awareness layer for mobile coding agents. This harness runs in
 * SHADOW MODE: across a set of simulated app builds it observes where Kittie *would*
 * intervene (which MCP tools it would call to ground a product decision) without forcing
 * the agent, then measures the quality and cost of those interventions.
 *
 * North-star = market-backed decisions ACCEPTED per active build — never API/tool calls.
 */

/** Coding agents the loop installs into. Default suite runs one canonical shadow profile. */
export type AgentName = "kittie-shadow" | "codex" | "claude" | "cursor";

/** A simulated app-build session — the unit the north-star is normalised against. */
export interface BuildScenario {
  id: string;
  /** Plain-language app idea, fills the golden prompts. */
  idea: string;
  /** Store category used to scope market lookups. */
  category: string;
  /** ISO market the build targets. */
  country: string;
  store: "apple" | "google";
  /** ASO seed keyword for the idea. */
  seedKeyword: string;
}

/** One MCP tool call Kittie would make to ground a decision (as planned by an intervention). */
export interface PlannedCall {
  tool: string;
  args: Record<string, unknown>;
  /** id of the DecisionSpec this call grounds. */
  decision: string;
  /** Human label: the market question this call answers. */
  intent: string;
}

/** Observed outcome of a tool call against the live MCP. */
export interface ToolCallRecord extends PlannedCall {
  /** Transport + tool succeeded (no throw, MCP did not flag isError). */
  ok: boolean;
  /** MCP tool returned isError. */
  isError: boolean;
  latencyMs: number;
  payloadChars: number;
  /** Agent-context cost of pulling this evidence in (~chars/4). Estimate, labelled as such. */
  tokensEst: number;
  /** Succeeded but returned no usable market evidence (empty list / null / error body). */
  empty: boolean;
  /** ok && !empty — a usable, on-topic intervention. */
  relevant: boolean;
  /** Fired but added nothing (errored or empty) — a wasted intervention. */
  falseActivation: boolean;
  /** Same tool+args already called earlier in this build — a repeated/unnecessary call. */
  redundant: boolean;
  /** Age in days of the underlying data if datable, else null (unknown). */
  freshnessDays: number | null;
  error?: string;
}

/** A decision a golden prompt is trying to resolve with market evidence. */
export interface DecisionSpec {
  id: string;
  label: string;
  /**
   * MODELLED acceptance (shadow mode): given the evidence the grounding calls returned,
   * would the decision be backed well enough to accept? Real acceptance needs the L5 intent
   * layer / L10 agent plugin to observe what the agent actually does with it.
   */
  accepts: (records: ToolCallRecord[]) => boolean;
}

export interface DecisionResult {
  id: string;
  label: string;
  /** Modelled — see DecisionSpec.accepts. */
  accepted: boolean;
  calls: number;
  relevantCalls: number;
  falseActivations: number;
}

/** One golden-prompt run inside one build. */
export interface InterventionResult {
  scenarioId: string;
  promptId: string;
  promptText: string;
  agent: AgentName;
  decisions: DecisionResult[];
  records: ToolCallRecord[];
}

export interface BuildResult {
  scenarioId: string;
  idea: string;
  agent: AgentName;
  interventions: InterventionResult[];
}
