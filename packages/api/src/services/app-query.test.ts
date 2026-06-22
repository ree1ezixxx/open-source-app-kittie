import { describe, expect, it } from "vitest";
import { chooseLatestCompleteSnapshotDate } from "./app-query.js";

describe("chooseLatestCompleteSnapshotDate", () => {
  it("skips a newer partial snapshot day when an older complete day exists", () => {
    expect(
      chooseLatestCompleteSnapshotDate(
        [
          { d: "2026-06-22", c: 500 },
          { d: "2026-06-21", c: 1_107_178 },
          { d: "2026-06-20", c: 1_104_002 },
        ],
      ),
    ).toBe("2026-06-21");
  });

  it("keeps the newest day for small fixture datasets", () => {
    expect(
      chooseLatestCompleteSnapshotDate(
        [
          { d: "2026-06-22", c: 2 },
          { d: "2026-06-21", c: 5 },
        ],
      ),
    ).toBe("2026-06-22");
  });

  it("uses configurable thresholds for small regression fixtures", () => {
    expect(
      chooseLatestCompleteSnapshotDate(
        [
          { d: "2026-06-22", c: 2 },
          { d: "2026-06-21", c: 10 },
        ],
        { minRows: 5, minRatio: 0.8 },
      ),
    ).toBe("2026-06-21");
  });
});
