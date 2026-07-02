/**
 * Output conventions shared by every command. Two modes: a plain-text human
 * table and machine JSON (`--json`). Later intelligence commands reuse these so
 * the surface stays consistent. All functions are pure (return strings).
 */

export type OutputMode = "human" | "json";

export const JSON_FLAG = "--json";

/** Split the `--json` flag out of an argv slice. */
export function detectMode(argv: string[]): { mode: OutputMode; rest: string[] } {
  const json = argv.includes(JSON_FLAG);
  return { mode: json ? "json" : "human", rest: argv.filter((a) => a !== JSON_FLAG) };
}

export function toJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Fixed-width text table. Column widths fit the widest cell (header or row). */
export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => (row[i] ?? "").length)),
  );
  const renderRow = (cells: string[]): string =>
    cells.map((cell, i) => (cell ?? "").padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  return [renderRow(headers), separator, ...rows.map(renderRow)].join("\n");
}

/**
 * Return the string to print for a result: JSON in `json` mode, otherwise the
 * output of `human()`. Keeping the human branch lazy avoids building a table
 * that JSON mode would throw away.
 */
export function formatOutput(mode: OutputMode, data: unknown, human: () => string): string {
  return mode === "json" ? toJson(data) : human();
}
