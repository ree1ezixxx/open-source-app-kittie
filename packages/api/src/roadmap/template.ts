import type { RoadmapNode, RoadmapStage, RoadmapTemplate } from "@kittie/types";

/**
 * The fixed, curated founder-journey template. Pure and deterministic — the same
 * spine + starter nodes for every venture. Build is intentionally a single
 * placeholder here ("Generate the app →"); a later slice replaces it with a live
 * window into the linked Builder project's real todos. Every other stage is this
 * curated set. Each node is anchored to something real: the founder reflecting
 * (you), the Builder acting (agent), or a Kittie surface (kittie).
 */

const STAGES: Array<{ id: RoadmapStage; label: string }> = [
  { id: "idea", label: "Idea" },
  { id: "initial", label: "Initial" },
  { id: "build", label: "Build" },
  { id: "security", label: "Security" },
  { id: "distribution", label: "Distribution" },
  { id: "launch", label: "Launch" },
  { id: "scale", label: "Scale" },
];

/** Node definitions without runtime state (state is applied at resolve time). */
type NodeDef = Omit<RoadmapNode, "state">;

const NODES: NodeDef[] = [
  // ---- Idea: decide what & whether ----
  { key: "idea-concept", stage: "idea", kind: "you", mode: "reflect", title: "Define the idea", subtitle: "What are you building, and why now?", dependsOn: [] },
  { key: "idea-audience", stage: "idea", kind: "you", mode: "reflect", title: "Who is it for?", subtitle: "The person with the problem", dependsOn: [] },
  { key: "idea-validate", stage: "idea", kind: "kittie", target: "teardown", title: "Validate vs competitors", subtitle: "Teardown similar apps", dependsOn: [] },

  // ---- Initial: set up the shell (depends on Idea) ----
  { key: "initial-name", stage: "initial", kind: "you", mode: "reflect", title: "Name the app", subtitle: "Working name + one-line pitch", dependsOn: ["idea-concept"] },
  { key: "initial-design", stage: "initial", kind: "you", mode: "reflect", title: "Design direction", subtitle: "Vibe, colours, the key screens", dependsOn: ["idea-audience", "idea-validate"] },

  // ---- Build: agent (placeholder until a Builder project is linked) ----
  { key: "build-generate", stage: "build", kind: "agent", title: "Generate the app", subtitle: "Build screens & features in Builder", dependsOn: ["initial-name", "initial-design"] },

  // ---- Security (depends on Build) ----
  { key: "security-secrets", stage: "security", kind: "you", mode: "manual", title: "Secure secrets & keys", subtitle: "No keys in the client", dependsOn: ["build-generate"] },
  { key: "security-privacy", stage: "security", kind: "you", mode: "manual", title: "Privacy & data handling", subtitle: "What you collect and why", dependsOn: ["build-generate"] },

  // ---- Distribution (depends on Security) ----
  { key: "dist-aso", stage: "distribution", kind: "kittie", target: "aso", title: "Research ASO keywords", subtitle: "Keyword Explorer for your niche", dependsOn: ["security-secrets"] },
  { key: "dist-listing", stage: "distribution", kind: "you", mode: "manual", title: "Prepare store listing", subtitle: "Copy, screenshots, icon", dependsOn: ["security-secrets"] },
  { key: "dist-submit", stage: "distribution", kind: "you", mode: "manual", title: "Submit to the store", subtitle: "Signing, review, release", dependsOn: ["security-privacy"] },

  // ---- Launch (depends on Distribution) ----
  { key: "launch-site", stage: "launch", kind: "you", mode: "manual", title: "Marketing site", subtitle: "A page people can land on", dependsOn: ["dist-aso"] },
  { key: "launch-outbound", stage: "launch", kind: "you", mode: "manual", title: "Launch outreach", subtitle: "Tell the people who'd care", dependsOn: ["dist-listing"] },

  // ---- Scale (depends on Launch) ----
  { key: "scale-growth", stage: "scale", kind: "kittie", target: "growth", title: "Track growth", subtitle: "Monitor momentum once live", dependsOn: ["launch-outbound"] },
  { key: "scale-iterate", stage: "scale", kind: "you", mode: "reflect", title: "Iterate on feedback", subtitle: "Double down on what works", dependsOn: ["launch-site"] },
];

/** Build the canonical roadmap template — every node defaults to `todo`. */
export function buildRoadmapTemplate(): RoadmapTemplate {
  return {
    stages: STAGES.map((s) => ({ ...s })),
    nodes: NODES.map((n) => ({ ...n, state: "todo" })),
  };
}
