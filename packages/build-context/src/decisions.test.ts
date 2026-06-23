import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DecisionPacket } from "@kittie/types";
import { BuildContextManager } from "./manager.js";

function packet(decision: string): DecisionPacket {
  return {
    decision,
    evidence: [],
    confidence: { score: 0.5, reasons: [] },
    coverage: { status: "partial", missing: [] },
    assumptions: [],
    unknowns: [],
    recommendedActions: [],
    snapshotId: "snap-1",
  };
}

describe("decisions.jsonl", () => {
  let root: string;
  let mgr: BuildContextManager;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kittie-bc-"));
    let counter = 0;
    mgr = new BuildContextManager({
      projectDir: join(root, "project"),
      globalDir: join(root, "global"),
      clock: () => 1_700_000_000_000,
      idGen: () => `id-${(counter += 1)}`,
    });
    mgr.create();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("appends without rewriting prior lines", () => {
    mgr.recordDecision(packet("first"), "accepted");
    const afterFirst = readFileSync(mgr.paths.decisionsFile, "utf8");

    mgr.recordDecision(packet("second"), "proposed");
    const afterSecond = readFileSync(mgr.paths.decisionsFile, "utf8");

    // appending the second record left the first byte-for-byte intact
    expect(afterSecond.startsWith(afterFirst)).toBe(true);

    const records = mgr.decisions();
    expect(records).toHaveLength(2);
    expect(records[0]?.packet.decision).toBe("first");
    expect(records[0]?.status).toBe("accepted");
    expect(records[1]?.packet.decision).toBe("second");
    expect(records[1]?.status).toBe("proposed");
  });
});
