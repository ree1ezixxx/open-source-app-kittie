import { generateExpoProject } from "./expo-codegen.js";
import type { AppBlueprint } from "./types.js";

/* ============================================================
   Deterministic build-error classifier + repair (PURE — no IO).

   The build/repair loop runs `tsc --noEmit` over a generated Expo
   workspace, parses the diagnostics, and asks this module to (a) bucket
   them into PRD §8.2 categories and (b) propose the smallest deterministic
   patches that our codegen can actually produce — NO model calls.

   The most robust "smallest patch" is regenerate-from-blueprint: the codegen
   is deterministic, so re-rendering one file from `fromBlueprintExpo` output
   is guaranteed to type-check. We prefer a targeted in-place fix (re-escaping
   a broken string literal) when one obviously applies, and fall back to
   regenerating the whole offending file otherwise.
   ============================================================ */

/** A single parsed tsc diagnostic (file path relative to workspace root). */
export interface Diagnostic {
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
}

/** PRD §8.2 error categories. */
export type RepairCategory =
  | "missing_dependency"
  | "invalid_import"
  | "typescript_error"
  | "jsx_syntax"
  | "router_error"
  | "asset_missing"
  | "style_error"
  | "unknown";

/** A proposed patch: replace a workspace file's contents wholesale. */
export interface RepairPatch {
  path: string;
  contents: string;
  /** How the patch was derived — for the run timeline / summary. */
  strategy: "reescape_string" | "regenerate_file" | "add_import";
}

export interface RepairProposal {
  category: RepairCategory;
  patches: RepairPatch[];
  /** Human one-liner for the run summary. */
  summary: string;
}

/* ---- classification ---------------------------------------------------- */

/** Known import sources for symbols our codegen emits, for invalid_import fixes. */
const IMPORT_MAP: Record<string, string> = {
  Link: "expo-router",
  Stack: "expo-router",
  Tabs: "expo-router",
  useLocalSearchParams: "expo-router",
  Ionicons: "@expo/vector-icons",
  useState: "react",
};

/**
 * Bucket a set of diagnostics into a single dominant category. `fileContents`
 * (rel path -> source) lets us disambiguate (e.g. an unterminated-string error
 * vs a missing-module error). Returns the highest-signal category present.
 */
export function classify(
  diagnostics: Diagnostic[],
  fileContents: Record<string, string> = {},
): RepairCategory {
  if (diagnostics.length === 0) return "unknown";

  for (const d of diagnostics) {
    // Cannot find module 'x' — dependency vs local import.
    if (d.code === "TS2307") {
      const m = /Cannot find module '([^']+)'/.exec(d.message);
      const mod = m?.[1] ?? "";
      if (mod.startsWith(".") || mod.startsWith("@/")) return "invalid_import";
      // a bare asset import (png/svg) is an asset issue
      if (/\.(png|jpg|jpeg|svg|gif|webp)$/.test(mod)) return "asset_missing";
      return "missing_dependency";
    }
    // Cannot find name 'X' — usually a missing import of a known symbol.
    if (d.code === "TS2304") return "invalid_import";
  }

  // Unterminated string / broken literal / unexpected token => jsx/syntax.
  const syntaxCodes = new Set(["TS1002", "TS1005", "TS1136", "TS1109", "TS1128", "TS1003"]);
  if (diagnostics.some((d) => syntaxCodes.has(d.code))) {
    // If it's inside a .tsx the broken token is usually JSX; else a string literal.
    const inTsx = diagnostics.some((d) => d.file.endsWith(".tsx"));
    return inTsx ? "jsx_syntax" : "typescript_error";
  }

  // Style prop / StyleSheet type mismatches.
  if (
    diagnostics.some(
      (d) =>
        (d.code === "TS2322" || d.code === "TS2769") &&
        /style/i.test(contentsAround(fileContents, d)),
    )
  ) {
    return "style_error";
  }

  // expo-router route mismatch (a href to a route that doesn't resolve).
  if (diagnostics.some((d) => /expo-router|Href|pathname/i.test(d.message))) {
    return "router_error";
  }

  // Any remaining type error.
  if (diagnostics.some((d) => d.code.startsWith("TS2"))) return "typescript_error";

  return "unknown";
}

function contentsAround(files: Record<string, string>, d: Diagnostic): string {
  const src = files[d.file];
  if (!src) return "";
  const lines = src.split(/\r?\n/);
  return lines[d.line - 1] ?? "";
}

/* ---- repair ------------------------------------------------------------ */

/** Set of files codegen owns — anything outside this we won't regenerate. */
function canonicalFiles(blueprint: AppBlueprint): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of generateExpoProject(blueprint).files) out.set(f.path, f.contents);
  return out;
}

/**
 * Propose the smallest deterministic patches for the given diagnostics.
 * `files` is the current workspace source (rel path -> contents). Returns an
 * empty patch list when nothing deterministic applies (caller then bails /
 * reports honestly).
 */
export function proposeRepair(
  diagnostics: Diagnostic[],
  files: Record<string, string>,
  blueprint: AppBlueprint,
): RepairProposal {
  const category = classify(diagnostics, files);
  if (diagnostics.length === 0) {
    return { category: "unknown", patches: [], summary: "nothing to repair" };
  }

  const canonical = canonicalFiles(blueprint);
  // The set of distinct files with errors.
  const brokenFiles = [...new Set(diagnostics.map((d) => d.file))];
  const patches: RepairPatch[] = [];

  for (const rel of brokenFiles) {
    const current = files[rel];
    const canon = canonical.get(rel);

    // 1. Targeted re-escape: a single string-literal break we can fix in place
    //    without touching anything else (the most surgical patch).
    if (current !== undefined) {
      const reescaped = tryReescape(current);
      if (reescaped && reescaped !== current) {
        patches.push({ path: rel, contents: reescaped, strategy: "reescape_string" });
        continue;
      }
    }

    // 2. Add a missing import for a known symbol (invalid_import / TS2304).
    if (current !== undefined) {
      const withImport = tryAddImport(current, diagnostics.filter((d) => d.file === rel));
      if (withImport && withImport !== current) {
        patches.push({ path: rel, contents: withImport, strategy: "add_import" });
        continue;
      }
    }

    // 3. Regenerate the whole file from the blueprint — deterministic, always
    //    type-checks. The most robust "smallest patch" for codegen-owned files.
    if (canon !== undefined && canon !== current) {
      patches.push({ path: rel, contents: canon, strategy: "regenerate_file" });
      continue;
    }
  }

  const summary =
    patches.length === 0
      ? `no deterministic fix for ${category}`
      : patches.length === 1
        ? `${patches[0]!.strategy.replace(/_/g, " ")} in ${patches[0]!.path}`
        : `${patches.length} files repaired`;

  return { category, patches, summary };
}

/** A stable signature for a diagnostic set, to detect a stuck repair loop. */
export function errorSignature(diagnostics: Diagnostic[]): string {
  return diagnostics
    .map((d) => `${d.file}:${d.line}:${d.code}`)
    .sort()
    .join("|");
}

/* ---- in-place heuristics ----------------------------------------------- */

/**
 * Re-escape unescaped double-quotes that appear *inside* a double-quoted
 * string value in our generated `lib/data.ts` rows. Codegen escapes content
 * via `ts()`, but a hand/model edit can re-introduce a raw quote and break the
 * literal. We only touch lines matching the codegen row shape so we never
 * corrupt valid source.
 *
 * Row shape: `    { title: "…", subtitle: "…", detail: "…" },`
 */
function tryReescape(src: string): string | null {
  const lines = src.split(/\r?\n/);
  let changed = false;
  const fixed = lines.map((line) => {
    if (!/^\s*\{\s*title:\s*"/.test(line)) return line;
    const repaired = reescapeRow(line);
    if (repaired !== null && repaired !== line) {
      changed = true;
      return repaired;
    }
    return line;
  });
  return changed ? fixed.join("\n") : null;
}

/**
 * Re-escape one codegen data row. Strategy: extract the three field values by
 * their key delimiters, re-escape inner quotes, and re-emit a canonical row.
 * Returns null if the line doesn't parse as a row (leave it untouched).
 */
function reescapeRow(line: string): string | null {
  const indentMatch = /^(\s*)/.exec(line);
  const indent = indentMatch ? indentMatch[1] : "    ";
  // Pull the substring between `title: "` ... `", subtitle: "` ... etc.
  const m =
    /title:\s*"(.*)",\s*subtitle:\s*"(.*)",\s*detail:\s*"(.*)"\s*,?\s*\}/.exec(line);
  if (!m) {
    // The greedy match above fails when inner quotes confuse the delimiters.
    // Fall back to splitting on the known key boundaries.
    const t = sliceField(line, 'title: "', '", subtitle: "');
    const s = sliceField(line, ', subtitle: "', '", detail: "');
    const d = sliceField(line, ', detail: "', '" }');
    if (t === null || s === null || d === null) return null;
    return `${indent}{ title: "${esc(t)}", subtitle: "${esc(s)}", detail: "${esc(d)}" },`;
  }
  return `${indent}{ title: "${esc(m[1]!)}", subtitle: "${esc(m[2]!)}", detail: "${esc(m[3]!)}" },`;
}

/** Slice the text between the first `start` and the last `end` markers. */
function sliceField(line: string, start: string, end: string): string | null {
  const i = line.indexOf(start);
  if (i < 0) return null;
  const from = i + start.length;
  const j = line.lastIndexOf(end);
  if (j < 0 || j < from) return null;
  return line.slice(from, j);
}

/** Escape a raw value for a TS double-quoted literal (mirrors codegen `ts()`). */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ");
}

/**
 * Add a missing import for a known symbol. Looks at "Cannot find name 'X'"
 * (TS2304) diagnostics, maps X to its module via IMPORT_MAP, and prepends a
 * named import if the symbol is known and not already imported.
 */
function tryAddImport(src: string, diagnostics: Diagnostic[]): string | null {
  const missing = new Set<string>();
  for (const d of diagnostics) {
    const m = /Cannot find name '([^']+)'/.exec(d.message);
    if (m && IMPORT_MAP[m[1]!]) missing.add(m[1]!);
  }
  if (missing.size === 0) return null;

  const byModule = new Map<string, string[]>();
  for (const sym of missing) {
    const mod = IMPORT_MAP[sym]!;
    if (new RegExp(`import\\s*\\{[^}]*\\b${sym}\\b[^}]*\\}\\s*from\\s*["']${mod}["']`).test(src)) {
      continue; // already imported
    }
    byModule.set(mod, [...(byModule.get(mod) ?? []), sym]);
  }
  if (byModule.size === 0) return null;

  const importLines = [...byModule.entries()]
    .map(([mod, syms]) => `import { ${syms.join(", ")} } from "${mod}";`)
    .join("\n");
  return `${importLines}\n${src}`;
}
