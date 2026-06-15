import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pruneRuns, readWorkspaceTree, syncWorkspace, workspaceRoot } from "./workspace.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "kittie-ws-"));
  process.env.WORKSPACES_DIR = dir;
});

afterEach(async () => {
  delete process.env.WORKSPACES_DIR;
  await rm(dir, { recursive: true, force: true });
});

const f = (p: string, contents: string) => ({ path: p, contents });

describe("workspaceRoot", () => {
  it("honours WORKSPACES_DIR", async () => {
    expect(await workspaceRoot()).toBe(path.resolve(dir));
  });
});

describe("syncWorkspace", () => {
  it("writes files into current/ and lists them", async () => {
    const res = await syncWorkspace("p1", [f("app/index.tsx", "a"), f("package.json", "{}")]);
    expect(res.written).toEqual(["app/index.tsx", "package.json"]);
    expect(res.deleted).toEqual([]);
    expect(res.skipped).toEqual([]);
    expect(await readWorkspaceTree("p1")).toEqual(["app/index.tsx", "package.json"]);
    const body = await readFile(path.join(dir, "p1", "current", "app", "index.tsx"), "utf8");
    expect(body).toBe("a");
  });

  it("skips unsafe paths instead of throwing", async () => {
    const res = await syncWorkspace("p2", [
      f("ok.txt", "ok"),
      f("/etc/passwd", "x"),
      f("../escape.txt", "x"),
      f("a/../../b.txt", "x"),
    ]);
    expect(res.written).toEqual(["ok.txt"]);
    expect(res.skipped).toEqual(["../escape.txt", "/etc/passwd", "a/../../b.txt"]);
  });

  it("deletes stale files but never build artifacts", async () => {
    await syncWorkspace("p3", [f("a.txt", "1"), f("b.txt", "2")]);
    // Drop a build artifact into current/ to prove it survives.
    const artifact = path.join(dir, "p3", "current", "node_modules", "dep", "x.js");
    await (await import("node:fs/promises")).mkdir(path.dirname(artifact), { recursive: true });
    await (await import("node:fs/promises")).writeFile(artifact, "keep");

    const res = await syncWorkspace("p3", [f("a.txt", "1-updated")]);
    expect(res.deleted).toEqual(["b.txt"]);
    expect(await readFile(path.join(dir, "p3", "current", "a.txt"), "utf8")).toBe("1-updated");
    expect(await readFile(artifact, "utf8")).toBe("keep");
    // node_modules excluded from the listed tree.
    expect(await readWorkspaceTree("p3")).toEqual(["a.txt"]);
  });

  it("rejects build-artifact file paths from the new set", async () => {
    const res = await syncWorkspace("p4", [f("dist/bundle.js", "x"), f("ok.txt", "y")]);
    expect(res.skipped).toEqual(["dist/bundle.js"]);
    expect(res.written).toEqual(["ok.txt"]);
  });

  it("snapshots before/after when given a runId", async () => {
    await syncWorkspace("p5", [f("a.txt", "v1")]);
    await syncWorkspace("p5", [f("a.txt", "v2")], "run-1");
    expect(await readFile(path.join(dir, "p5", "runs", "run-1", "before", "a.txt"), "utf8")).toBe("v1");
    expect(await readFile(path.join(dir, "p5", "runs", "run-1", "after", "a.txt"), "utf8")).toBe("v2");
  });
});

describe("readWorkspaceTree", () => {
  it("returns empty for an unsynced project", async () => {
    expect(await readWorkspaceTree("nope")).toEqual([]);
  });
});

describe("pruneRuns", () => {
  it("keeps the N most recent run dirs", async () => {
    await syncWorkspace("p6", [f("a.txt", "0")]);
    for (let i = 1; i <= 4; i++) {
      await syncWorkspace("p6", [f("a.txt", String(i))], `run-${i}`);
      // Stagger mtimes so prune ordering is deterministic.
      await new Promise((r) => setTimeout(r, 10));
    }
    const removed = await pruneRuns("p6", 2);
    expect(removed.sort()).toEqual(["run-1", "run-2"]);
    const left = await readWorkspaceTree("p6");
    expect(left).toEqual(["a.txt"]);
  });
});
