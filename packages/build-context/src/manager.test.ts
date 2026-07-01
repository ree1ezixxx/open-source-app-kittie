import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Clock, IdGen } from "./clock.js";
import { BuildContextExistsError, BuildContextManager } from "./manager.js";

function makeManager(root: string): BuildContextManager {
  let counter = 0;
  const idGen: IdGen = () => `id-${(counter += 1)}`;
  const clock: Clock = () => 1_700_000_000_000;
  return new BuildContextManager({
    projectDir: join(root, "project"),
    globalDir: join(root, "global"),
    clock,
    idGen,
  });
}

describe("BuildContextManager", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kittie-bc-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("create → write → re-read reconstructs identical state", () => {
    const mgr = makeManager(root);
    const ctx = mgr.create({
      profile: { idea: "AI recipe planner", platforms: ["apple"] },
      preferences: [{ text: "Always target iOS first", kind: "always" }],
      unknowns: ["What's the monetisation model?"],
    });

    expect(ctx.phase).toBe("ideation");
    expect(ctx.profile.idea.value).toBe("AI recipe planner");
    expect(ctx.profile.idea.kind).toBe("observed");
    expect(ctx.profile.idea.source).toBe("user");
    expect(ctx.profile.monetisation.kind).toBe("missing");

    // a fresh manager reading the same files rebuilds the exact same object
    const reread = makeManager(root).read();
    expect(reread).toEqual(ctx);

    // memory.md is rendered from context.json
    const memory = readFileSync(mgr.paths.memoryFile, "utf8");
    expect(memory).toContain("AI recipe planner");
    expect(memory).toContain("Always target iOS first");
  });

  it("refuses a second create over an existing context", () => {
    makeManager(root).create();
    expect(() => makeManager(root).create()).toThrow(BuildContextExistsError);
  });

  it("update merges — never blanks fields the patch omits", () => {
    const mgr = makeManager(root);
    mgr.create({ profile: { idea: "Habit tracker" } });
    const updated = mgr.update({ phase: "scoping", profile: { monetisation: "subscription" } });

    expect(updated.phase).toBe("scoping");
    expect(updated.profile.monetisation.value).toBe("subscription");
    expect(updated.profile.idea.value).toBe("Habit tracker");
  });

  it("get() returns a compact digest merging global + project preferences", () => {
    const mgr = makeManager(root);
    mgr.addGlobalPreference({ text: "Prefer dark mode", kind: "like" });
    mgr.create({ preferences: [{ text: "No ads ever", kind: "never" }] });

    const digest = mgr.get();
    const texts = digest.preferences.map((p) => p.text);
    expect(texts).toContain("Prefer dark mode");
    expect(texts).toContain("No ads ever");
    expect(digest.preferences[0]?.scope).toBe("global");

    const idea = digest.profile.find((f) => f.field === "idea");
    expect(idea?.present).toBe(false);
    expect(digest.openUnknowns).toHaveLength(0);
  });
});
