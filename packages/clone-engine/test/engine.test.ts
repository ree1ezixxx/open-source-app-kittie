import { describe, expect, it } from "vitest";
import { fromBlueprint, generateProject, validateBlueprint } from "../src/index.js";
import type { CloneSource } from "../src/index.js";

const src: CloneSource = {
  id: "apple:1",
  title: "Cal AI Calorie Tracker",
  developer: "Acme",
  category: "Health & Fitness",
  description: "Track calories from a photo.",
};

describe("validateBlueprint — clamps arbitrary model output into a safe shape", () => {
  it("falls back fully when given junk", () => {
    const b = validateBlueprint({}, src);
    expect(b.appName).toBeTruthy();
    expect(b.bundleId).toMatch(/^com\./);
    expect(b.accentHex).toMatch(/^#[0-9A-F]{6}$/);
    expect(b.tabs.length).toBeGreaterThanOrEqual(2);
  });

  it("clamps a bad hex, caps tabs at 5, and guarantees >=3 items/tab", () => {
    const b = validateBlueprint(
      {
        appName: "X",
        accentHex: "not-a-color",
        tabs: Array.from({ length: 9 }, (_, i) => ({ title: `T${i}`, kind: "list", items: [] })),
      },
      src,
    );
    expect(b.accentHex).toBe("#4F46E5");
    expect(b.tabs.length).toBe(5);
    for (const t of b.tabs) expect(t.items.length).toBeGreaterThanOrEqual(3);
  });

  it("coerces unknown tab kinds and SF symbols to safe defaults", () => {
    const b = validateBlueprint(
      { tabs: [{ title: "A", kind: "explode", symbol: "nope.bad", items: [] }, { title: "B", kind: "grid", symbol: "star.fill", items: [] }] },
      src,
    );
    expect(b.tabs[0]!.kind).toBe("list");
    // unknown symbol replaced by a safe default
    expect(b.tabs[0]!.symbol).not.toBe("nope.bad");
  });
});

describe("generateProject — deterministic, compile-safe SwiftUI", () => {
  it("emits a complete project with exactly one @main and one screen per tab", () => {
    const b = validateBlueprint({}, src);
    const { files, projectName } = generateProject(b);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("project.yml");
    expect(paths).toContain("Sources/App.swift");
    expect(paths).toContain("Sources/RootView.swift");
    const mainCount = files.filter((f) => f.contents.includes("@main")).length;
    expect(mainCount).toBe(1);
    const screens = paths.filter((p) => /Sources\/.*Screen\d+\.swift$/.test(p));
    expect(screens.length).toBe(b.tabs.length);
    expect(projectName).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
  });

  it("escapes quotes/backslashes/newlines in sample content (no broken literals)", () => {
    const b = validateBlueprint(
      {
        tabs: [
          { title: "Feed", kind: "feed", symbol: "house.fill", headline: 'He said "hi"', items: [{ title: 'a"b\\c', subtitle: "x\ny", detail: "z" }] },
          { title: "List", kind: "list", symbol: "list.bullet", headline: "L", items: [{ title: "ok", subtitle: "", detail: "" }] },
        ],
      },
      src,
    );
    const models = generateProject(b).files.find((f) => f.path === "Sources/Models.swift")!;
    // the raw unescaped sequence must not survive; the escaped form must be present
    expect(models.contents).not.toContain('a"b\\c');
    expect(models.contents).toContain('a\\"b');
    // newlines in content are flattened, never raw inside a literal
    const literalLines = models.contents.split("\n").filter((l) => l.includes("Entry(title:"));
    for (const l of literalLines) expect((l.match(/(?<!\\)"/g) ?? []).length % 2).toBe(0);
  });

  it("fromBlueprint returns buildCommands referencing the project name", () => {
    const r = fromBlueprint(validateBlueprint({ appName: "Lumera" }, src));
    expect(r.projectName).toBe("Lumera");
    expect(r.buildCommands.join(" ")).toContain("Lumera.xcodeproj");
  });
});
