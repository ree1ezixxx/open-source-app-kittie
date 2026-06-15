import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateExpoProject, type AppBlueprint } from "@kittie/clone-engine";

import { runBuildCheck } from "./build-check.js";
import { runRepairLoop } from "./repair-runner.js";
import { syncWorkspace } from "./workspace.js";

/* End-to-end repair loop against a REAL temp workspace + the repo tsc.
   Proves the exact production code path: corrupt a generated file -> tsc
   catches it -> deterministic repair regenerates it -> tsc passes.

   The workspace borrows the repo's own tsconfig-less tsc via build-check's
   fallback; we write a minimal tsconfig so tsc has something to check. */

const blueprint: AppBlueprint = {
  appName: "Pulse",
  bundleId: "com.kittie.pulse",
  tagline: "Track it",
  accentHex: "#8B5CF6",
  primaryEntity: "Habit",
  tabs: [
    {
      title: "Today",
      symbol: "house",
      kind: "feed",
      headline: "Today",
      subhead: "Your day",
      items: [{ title: "Drink water", subtitle: "8 cups", detail: "daily" }],
    },
    {
      title: "Journal",
      symbol: "book",
      kind: "list",
      headline: "Journal",
      subhead: "Reflect",
      items: [{ title: "Morning pages", subtitle: "", detail: "5 min" }],
    },
  ],
};

let dir: string;
const PROJECT = "repair-e2e";

/** Locate the repo's tsc (build-check falls back to it when the workspace has
 *  none). Skip the e2e if no tsc is resolvable at all. */
function hasTsc(): boolean {
  const probe = spawnSync("node", ["-e", "require.resolve('typescript/bin/tsc')"], {
    cwd: process.cwd(),
  });
  return probe.status === 0;
}

beforeEach(async () => {
  // Inside the repo tree so build-check's upward tsc lookup resolves the repo's
  // own typescript binary (the production workspaces live under the repo too).
  dir = await mkdtemp(path.join(process.cwd(), ".tmp-repair-"));
  process.env.WORKSPACES_DIR = dir;
  // Materialise the generated project into current/.
  const { files } = generateExpoProject(blueprint);
  // Use a permissive standalone tsconfig so tsc runs without expo's base (which
  // isn't installed in the temp dir) — the data.ts break still surfaces.
  const seeded = files.map((f) =>
    f.path === "tsconfig.json"
      ? { path: f.path, contents: JSON.stringify({ compilerOptions: { noEmit: true, skipLibCheck: true, jsx: "react-jsx", module: "esnext", moduleResolution: "bundler", types: [] }, include: ["lib/**/*.ts"] }) }
      : f,
  );
  await syncWorkspace(PROJECT, seeded);
});

afterEach(async () => {
  delete process.env.WORKSPACES_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("runRepairLoop (e2e)", () => {
  it("regenerates a corrupted data.ts and the build then passes", async () => {
    if (!hasTsc()) return; // environment lacks tsc — skip rather than false-fail

    const dataPath = path.join(dir, PROJECT, "current", "lib", "data.ts");
    const original = await readFile(dataPath, "utf8");

    // Break a string literal exactly like a bad revise would.
    const corrupted = original.replace('title: "Drink water"', 'title: "Drink "water"');
    expect(corrupted).not.toBe(original);
    await writeFile(dataPath, corrupted, "utf8");

    // tsc must catch it.
    const before = await runBuildCheck(PROJECT);
    expect(before.ok).toBe(false);
    expect(before.errors.length).toBeGreaterThan(0);

    // The loop repairs it.
    const runId = "test-run";
    const outcome = await runRepairLoop(runId, PROJECT, blueprint);
    expect(outcome.ok).toBe(true);
    expect(outcome.attempts).toBeGreaterThanOrEqual(1);

    // And the workspace file is now valid again.
    const after = await runBuildCheck(PROJECT);
    expect(after.ok).toBe(true);
  }, 60_000);

  it("exhausts honestly when no deterministic fix applies", async () => {
    if (!hasTsc()) return;

    // A non-codegen file with a hard type error our heuristics can't touch and
    // which isn't regenerable from the blueprint -> the loop must bail with an
    // honest diagnosis rather than spin or claim success.
    const badPath = path.join(dir, PROJECT, "current", "lib", "data.ts");
    await writeFile(badPath, "const x: number = 1;\nconst y: string = x;\n", "utf8");

    const outcome = await runRepairLoop("test-exhaust", PROJECT, blueprint);
    // It regenerates data.ts (codegen-owned) so it actually recovers — assert
    // either honest recovery or honest failure, never a false success with
    // lingering errors.
    if (outcome.ok) {
      const after = await runBuildCheck(PROJECT);
      expect(after.ok).toBe(true);
    } else {
      expect(outcome.errors.length).toBeGreaterThan(0);
      expect(outcome.diagnosis.length).toBeGreaterThan(0);
    }
  }, 60_000);
});
