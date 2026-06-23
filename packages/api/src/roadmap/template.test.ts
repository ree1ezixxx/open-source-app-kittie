import { describe, expect, it } from "vitest";

import { buildRoadmapTemplate } from "./template.js";

const STAGES = ["idea", "initial", "build", "security", "distribution", "launch", "scale"];

describe("buildRoadmapTemplate", () => {
  it("exposes the 7 fixed stages in order", () => {
    const { stages } = buildRoadmapTemplate();
    expect(stages.map((s) => s.id)).toEqual(STAGES);
  });

  it("gives every node a valid stage and kind, and starts it at todo", () => {
    const { nodes } = buildRoadmapTemplate();
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(STAGES).toContain(n.stage);
      expect(["you", "agent", "kittie"]).toContain(n.kind);
      expect(n.state).toBe("todo");
    }
  });

  it("has unique node keys", () => {
    const keys = buildRoadmapTemplate().nodes.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only references dependsOn keys that exist", () => {
    const { nodes } = buildRoadmapTemplate();
    const keys = new Set(nodes.map((n) => n.key));
    for (const n of nodes) {
      for (const dep of n.dependsOn) expect(keys).toContain(dep);
    }
  });

  it("tags you nodes with a mode and kittie nodes with a target", () => {
    for (const n of buildRoadmapTemplate().nodes) {
      if (n.kind === "you") expect(n.mode).toBeDefined();
      if (n.kind === "kittie") expect(n.target).toBeDefined();
      if (n.kind === "agent") {
        expect(n.mode).toBeUndefined();
        expect(n.target).toBeUndefined();
      }
    }
  });

  it("is deterministic", () => {
    expect(buildRoadmapTemplate()).toEqual(buildRoadmapTemplate());
  });

  it("has no dependency cycles", () => {
    const { nodes } = buildRoadmapTemplate();
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    const seen = new Map<string, boolean>(); // key -> in-progress(false)|done(true)
    const visit = (key: string): void => {
      const state = seen.get(key);
      if (state === true) return;
      if (state === false) throw new Error(`cycle at ${key}`);
      seen.set(key, false);
      for (const dep of byKey.get(key)!.dependsOn) visit(dep);
      seen.set(key, true);
    };
    expect(() => nodes.forEach((n) => visit(n.key))).not.toThrow();
  });
});
