/** Minimal flag parser for the intelligence commands. Splits `--key value`,
 *  `--key=value`, and bare `--key` (→ "true") out of an argv slice. `--json`
 *  is handled separately by output.detectMode before this runs. Pure. */
export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string>;
}

export function parseFlags(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq >= 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = "true";
    }
  }
  return { positionals, flags };
}
