import { describe, expect, it } from "vitest";
import {
  buildBlueprintFromPrompt,
  fromBlueprintExpo,
  generateExpoProject,
  heuristicBlueprint,
  heuristicRevise,
  reviseBlueprint,
} from "../src/index.js";

describe("heuristicBlueprint — offline prompt -> blueprint", () => {
  it("matches a habit-tracker archetype", () => {
    const b = heuristicBlueprint("a habit tracker with streaks");
    expect(b.primaryEntity).toBe("Habit");
    expect(b.accentHex).toBe("#34C759");
    expect(b.tabs.length).toBeGreaterThanOrEqual(2);
    expect(b.bundleId).toMatch(/^com\.rorkclone\./);
  });

  it("falls back to a generic shell on unmatched prompts", () => {
    const b = heuristicBlueprint("zzzz unmatched gibberish");
    expect(b.tabs.length).toBeGreaterThanOrEqual(2);
    expect(b.accentHex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("heuristicRevise — offline chat instructions", () => {
  const base = heuristicBlueprint("a recipe app");

  it("changes accent to a named color", () => {
    const b = heuristicRevise(base, "change the accent color to purple");
    expect(b.accentHex).toBe("#AF52DE");
  });

  it("changes accent to an explicit hex", () => {
    const b = heuristicRevise(base, "make the theme #112233");
    expect(b.accentHex).toBe("#112233");
  });

  it("adds a tab (capped at 5) and removes a tab (floor 2)", () => {
    const added = heuristicRevise(base, "add a profile tab");
    expect(added.tabs.length).toBe(base.tabs.length + 1);
    expect(added.tabs.at(-1)!.kind).toBe("profile");

    const removed = heuristicRevise(added, "remove the Profile tab");
    expect(removed.tabs.length).toBe(base.tabs.length);
  });

  it("renames the app", () => {
    const b = heuristicRevise(base, "rename the app to Crumb");
    expect(b.appName).toBe("Crumb");
  });

  it("does not mutate the input blueprint", () => {
    const snapshot = JSON.stringify(base);
    heuristicRevise(base, "add a stats tab and make it red");
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe("model-backed entry points fall back safely", () => {
  it("buildBlueprintFromPrompt survives a throwing generator", async () => {
    const b = await buildBlueprintFromPrompt("a fitness app", async () => {
      throw new Error("quota");
    });
    expect(b.tabs.length).toBeGreaterThanOrEqual(2);
  });

  it("reviseBlueprint survives junk model output", async () => {
    const base = heuristicBlueprint("a journal");
    const b = await reviseBlueprint(base, "make it blue", async () => ({ tabs: "nope" }));
    expect(b.tabs.length).toBeGreaterThanOrEqual(2);
    expect(b.accentHex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("generateExpoProject — deterministic Expo codegen", () => {
  const b = heuristicBlueprint("a workout tracker for lifters");
  const { slug, files } = generateExpoProject(b);
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.contents]));

  it("emits a complete project skeleton", () => {
    for (const p of [
      "package.json",
      "app.json",
      "tsconfig.json",
      "lib/theme.ts",
      "lib/data.ts",
      "components/ui.tsx",
      "app/_layout.tsx",
    ]) {
      expect(byPath[p], p).toBeTruthy();
    }
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("first tab is index and every tab has a screen registered in the layout", () => {
    expect(byPath["app/index.tsx"]).toBeTruthy();
    const layout = byPath["app/_layout.tsx"]!;
    const screenFiles = files.filter((f) => f.path.startsWith("app/") && f.path !== "app/_layout.tsx");
    expect(screenFiles.length).toBe(b.tabs.length);
    for (const f of screenFiles) {
      const route = f.path.replace(/^app\//, "").replace(/\.tsx$/, "");
      expect(layout).toContain(`name="${route}"`);
    }
  });

  it("duplicate tab titles get unique routes that still match the layout", () => {
    const dup = {
      ...b,
      tabs: [b.tabs[0]!, { ...b.tabs[0]!, title: "Train" }, { ...b.tabs[0]!, title: "Train" }],
    };
    const out = generateExpoProject(dup);
    const paths = out.files.filter((f) => f.path.startsWith("app/")).map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    const layout = out.files.find((f) => f.path === "app/_layout.tsx")!.contents;
    for (const p of paths.filter((p) => p !== "app/_layout.tsx")) {
      const route = p.replace(/^app\//, "").replace(/\.tsx$/, "");
      expect(layout).toContain(`name="${route}"`);
    }
  });

  it("escapes quotes/newlines from model content", () => {
    const evil = {
      ...b,
      appName: 'Say "Hi"\nApp',
      tabs: [
        {
          ...b.tabs[0]!,
          headline: 'He said "go"',
          items: [{ title: 'A "quoted" title', subtitle: "line\nbreak", detail: "x" }],
        },
        b.tabs[1]!,
      ],
    };
    const out = generateExpoProject(evil);
    const data = out.files.find((f) => f.path === "lib/data.ts")!.contents;
    expect(data).toContain('\\"quoted\\"');
    expect(data).not.toMatch(/[^\\]"\n.*break/);
    expect(() => JSON.parse(out.files.find((f) => f.path === "app.json")!.contents)).not.toThrow();
  });

  it("valid JSON in package.json/app.json; sample data groups per tab", () => {
    expect(() => JSON.parse(byPath["package.json"]!)).not.toThrow();
    const appJson = JSON.parse(byPath["app.json"]!);
    expect(appJson.expo.slug).toBe(slug);
    for (let i = 0; i < b.tabs.length; i++) {
      expect(byPath["lib/data.ts"]).toContain(`tab${i}:`);
    }
  });

  it("fromBlueprintExpo wraps it with expo build commands", () => {
    const res = fromBlueprintExpo(b);
    expect(res.buildCommands.join(" ")).toContain("expo start");
    expect(res.projectName).toBe(slug);
  });
});
