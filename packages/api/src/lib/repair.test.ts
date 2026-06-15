import { describe, expect, it } from "vitest";

import {
  classify,
  errorSignature,
  generateExpoProject,
  proposeRepair,
  type AppBlueprint,
  type Diagnostic,
} from "@kittie/clone-engine";

import { parseTscOutput } from "./build-check.js";

/* Repair classifier + proposer unit tests. The engine is PURE so these run
   without any workspace IO. */

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

/** Pull a generated file's contents by path. */
function gen(path: string): string {
  const file = generateExpoProject(blueprint).files.find((f) => f.path === path);
  if (!file) throw new Error(`no generated file ${path}`);
  return file.contents;
}

describe("parseTscOutput", () => {
  it("parses standard tsc diagnostics", () => {
    const out = parseTscOutput(
      "lib/data.ts(10,28): error TS1005: ',' expected.\napp/(tabs)/index.tsx(3,1): error TS2304: Cannot find name 'Link'.",
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ file: "lib/data.ts", line: 10, col: 28, code: "TS1005" });
    expect(out[1]).toMatchObject({ code: "TS2304", file: "app/(tabs)/index.tsx" });
  });

  it("ignores non-error lines", () => {
    expect(parseTscOutput("Found 0 errors.\n\n")).toEqual([]);
  });
});

describe("classify", () => {
  it("classifies a missing dependency", () => {
    const d: Diagnostic[] = [
      { file: "app/x.tsx", line: 1, col: 1, code: "TS2307", message: "Cannot find module 'expo-router' or its corresponding type declarations." },
    ];
    expect(classify(d)).toBe("missing_dependency");
  });

  it("classifies a relative import as invalid_import", () => {
    const d: Diagnostic[] = [
      { file: "app/x.tsx", line: 1, col: 1, code: "TS2307", message: "Cannot find module '../lib/theme'." },
    ];
    expect(classify(d)).toBe("invalid_import");
  });

  it("classifies a broken string literal in a .ts file as typescript_error", () => {
    const d: Diagnostic[] = [
      { file: "lib/data.ts", line: 10, col: 28, code: "TS1005", message: "',' expected." },
    ];
    expect(classify(d)).toBe("typescript_error");
  });

  it("classifies a missing name as invalid_import", () => {
    const d: Diagnostic[] = [
      { file: "app/x.tsx", line: 1, col: 1, code: "TS2304", message: "Cannot find name 'Link'." },
    ];
    expect(classify(d)).toBe("invalid_import");
  });

  it("returns unknown for empty diagnostics", () => {
    expect(classify([])).toBe("unknown");
  });
});

describe("proposeRepair", () => {
  it("clean pass-through: empty diagnostics propose nothing", () => {
    const p = proposeRepair([], {}, blueprint);
    expect(p.patches).toHaveLength(0);
  });

  it("re-escapes a broken string literal in lib/data.ts", () => {
    const original = gen("lib/data.ts");
    // Inject an unescaped quote inside a title value.
    const corrupted = original.replace('title: "Drink water"', 'title: "Drink "water"');
    expect(corrupted).not.toBe(original);
    const diagnostics: Diagnostic[] = [
      { file: "lib/data.ts", line: 1, col: 1, code: "TS1005", message: "',' expected." },
    ];
    const p = proposeRepair(diagnostics, { "lib/data.ts": corrupted }, blueprint);
    expect(p.patches).toHaveLength(1);
    const patch = p.patches[0]!;
    expect(["reescape_string", "regenerate_file"]).toContain(patch.strategy);
    // the repaired content must be a clean, type-safe lib/data.ts — either the
    // regenerated canonical file or an in-place re-escape. It must not contain
    // the broken unescaped-quote sequence.
    expect(patch.contents).not.toContain('"Drink "water"');
    expect(patch.contents).toContain("export const sampleData");
  });

  it("re-escapes in place when the row is otherwise valid (surgical path)", () => {
    // A standalone data file whose ONLY issue is an inner unescaped quote in a
    // row, where regenerate would also work but reescape is the smaller patch.
    const src = [
      "export const sampleData = {",
      '    { title: "Thoughts on "sobriety", subtitle: "", detail: "5 min" },',
      "};",
    ].join("\n");
    const diagnostics: Diagnostic[] = [
      { file: "custom/notes.ts", line: 2, col: 28, code: "TS1005", message: "',' expected." },
    ];
    const p = proposeRepair(diagnostics, { "custom/notes.ts": src }, blueprint);
    expect(p.patches).toHaveLength(1);
    expect(p.patches[0]!.strategy).toBe("reescape_string");
    // the inner quote(s) are now escaped so the literal parses
    expect(p.patches[0]!.contents).toContain('\\"sobriety');
    expect(p.patches[0]!.contents).not.toContain('on "sobriety');
  });

  it("regenerates a drifted codegen file as a fallback", () => {
    // A theme file with a wholly broken body that no in-place heuristic touches.
    const diagnostics: Diagnostic[] = [
      { file: "lib/theme.ts", line: 2, col: 1, code: "TS2322", message: "Type error." },
    ];
    const p = proposeRepair(diagnostics, { "lib/theme.ts": "export const theme = BROKEN;" }, blueprint);
    expect(p.patches).toHaveLength(1);
    expect(p.patches[0]!.strategy).toBe("regenerate_file");
    expect(p.patches[0]!.contents).toBe(gen("lib/theme.ts"));
  });

  it("adds a missing import for a known symbol", () => {
    const src = "export default function X() {\n  return <Link href=\"/\" />;\n}\n";
    const diagnostics: Diagnostic[] = [
      { file: "app/(tabs)/extra.tsx", line: 2, col: 11, code: "TS2304", message: "Cannot find name 'Link'." },
    ];
    // not a codegen-owned path => no regenerate fallback, must add import
    const p = proposeRepair(diagnostics, { "app/(tabs)/extra.tsx": src }, blueprint);
    expect(p.patches).toHaveLength(1);
    expect(p.patches[0]!.strategy).toBe("add_import");
    expect(p.patches[0]!.contents).toContain('import { Link } from "expo-router";');
  });

  it("proposes nothing when there is no deterministic fix", () => {
    const diagnostics: Diagnostic[] = [
      { file: "unknown/file.ts", line: 1, col: 1, code: "TS9999", message: "mystery." },
    ];
    const p = proposeRepair(diagnostics, { "unknown/file.ts": "const x = 1;" }, blueprint);
    expect(p.patches).toHaveLength(0);
  });
});

describe("errorSignature", () => {
  it("is stable across ordering and ignores column/message", () => {
    const a: Diagnostic[] = [
      { file: "a.ts", line: 1, col: 5, code: "TS1005", message: "x" },
      { file: "b.ts", line: 2, col: 9, code: "TS2304", message: "y" },
    ];
    const b: Diagnostic[] = [
      { file: "b.ts", line: 2, col: 1, code: "TS2304", message: "different" },
      { file: "a.ts", line: 1, col: 99, code: "TS1005", message: "msg" },
    ];
    expect(errorSignature(a)).toBe(errorSignature(b));
  });
});
