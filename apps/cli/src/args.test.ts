import { describe, expect, it } from "vitest";
import { parseFlags } from "./args.js";

describe("parseFlags", () => {
  it("collects positionals", () => {
    expect(parseFlags(["a", "b", "c"])).toEqual({ positionals: ["a", "b", "c"], flags: {} });
  });

  it("parses --key value", () => {
    expect(parseFlags(["--country", "US", "--limit", "5"]).flags).toEqual({ country: "US", limit: "5" });
  });

  it("parses --key=value", () => {
    expect(parseFlags(["--period=30d"]).flags).toEqual({ period: "30d" });
  });

  it("treats a trailing bare --flag as true", () => {
    expect(parseFlags(["--verbose"]).flags).toEqual({ verbose: "true" });
  });

  it("keeps positionals and flags separate", () => {
    const parsed = parseFlags(["focus timer", "--store", "apple"]);
    expect(parsed.positionals).toEqual(["focus timer"]);
    expect(parsed.flags).toEqual({ store: "apple" });
  });
});
