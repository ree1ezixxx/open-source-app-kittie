import { beforeEach, describe, expect, it, vi } from "vitest";

const runSnapshotBulk = vi.fn(async () => undefined);
const runScore = vi.fn(async () => undefined);
const invalidateAppReadCaches = vi.fn();

vi.mock("@kittie/ingest", () => ({
  runSnapshotBulk,
  runScore,
  runAppleDiscover: vi.fn(),
  runGoogleExpand: vi.fn(),
}));

vi.mock("./services/db-app-service.js", () => ({
  invalidateAppReadCaches,
}));

const { runSnapshotsDailySweep } = await import("./sweeps.js");

describe("runSnapshotsDailySweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs snapshot-bulk and score in-process, then busts read caches", async () => {
    const summary = await runSnapshotsDailySweep();

    expect(runSnapshotBulk).toHaveBeenCalledOnce();
    expect(runScore).toHaveBeenCalledOnce();
    expect(invalidateAppReadCaches).toHaveBeenCalledOnce();
    expect(summary).toBe("snapshots + chart ranks + scores refreshed");
  });
});
