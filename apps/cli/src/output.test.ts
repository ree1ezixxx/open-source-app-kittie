import { describe, expect, it } from "vitest";
import { detectMode, formatOutput, renderTable, toJson } from "./output.js";

describe("detectMode", () => {
  it("defaults to human and strips no args", () => {
    expect(detectMode(["doctor"])).toEqual({ mode: "human", rest: ["doctor"] });
  });

  it("detects --json and removes it from the args", () => {
    expect(detectMode(["config", "--json"])).toEqual({ mode: "json", rest: ["config"] });
  });
});

describe("renderTable", () => {
  it("pads columns to the widest cell and adds a separator", () => {
    const table = renderTable(["Name", "Score"], [["Focus", "78"], ["A", "4"]]);
    const lines = table.split("\n");
    expect(lines[0]).toBe("Name   Score");
    expect(lines[1]).toBe("-----  -----");
    expect(lines[2]).toBe("Focus  78");
    expect(lines[3]).toBe("A      4");
  });
});

describe("formatOutput", () => {
  it("emits JSON in json mode without calling the human branch", () => {
    let called = false;
    const out = formatOutput("json", { a: 1 }, () => {
      called = true;
      return "human";
    });
    expect(out).toBe(toJson({ a: 1 }));
    expect(called).toBe(false);
  });

  it("emits the human branch in human mode", () => {
    expect(formatOutput("human", { a: 1 }, () => "readable")).toBe("readable");
  });
});
