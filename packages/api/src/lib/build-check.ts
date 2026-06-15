import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { Diagnostic } from "@kittie/clone-engine";

import { workspaceRoot } from "./workspace.js";

/* ============================================================
   Build check — the real "Validating" gate.

   Runs `tsc --noEmit` over a generated workspace's current/ tree. tsc is fast
   and deterministic (a full `expo export` is far too slow to run per message),
   and it catches every failure mode our deterministic repair targets:
   string-literal breaks, missing imports, template drift.

   tsc resolution order:
     1. the workspace's own node_modules/.bin/tsc (warm projects have it)
     2. the repo's typescript binary, pointed at the workspace tsconfig
   ============================================================ */

const TSC_TIMEOUT_MS = 120_000;

export interface BuildCheckResult {
  ok: boolean;
  errors: Diagnostic[];
  /** raw tsc stdout+stderr, for the run log / debugging */
  output: string;
  /** which tsc binary resolved */
  tscPath: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a tsc binary to run for `workspaceDir`. */
async function resolveTsc(workspaceDir: string): Promise<{ bin: string; args: string[] } | null> {
  const localBin = path.join(workspaceDir, "node_modules", ".bin", "tsc");
  if (await fileExists(localBin)) {
    return { bin: localBin, args: ["--noEmit"] };
  }
  // Repo fallback: walk up for a node_modules/.bin/tsc.
  let dir = workspaceDir;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "node_modules", ".bin", "tsc");
    if (await fileExists(candidate)) {
      return { bin: candidate, args: ["--noEmit", "--project", path.join(workspaceDir, "tsconfig.json")] };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Parse standard tsc diagnostics: `file(line,col): error TSxxxx: message`. */
export function parseTscOutput(output: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const re = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;
  for (const raw of output.split(/\r?\n/)) {
    const m = re.exec(raw.trim());
    if (!m) continue;
    out.push({
      file: m[1]!.split(path.sep).join("/"),
      line: Number(m[2]),
      col: Number(m[3]),
      code: m[4]!,
      message: m[5]!,
    });
  }
  return out;
}

/** Run the build check for a project's current/ workspace. */
export async function runBuildCheck(projectId: string): Promise<BuildCheckResult> {
  const current = path.join(await workspaceRoot(), projectId, "current");
  const resolved = await resolveTsc(current);
  if (!resolved) {
    return { ok: false, errors: [], output: "no tsc binary found", tscPath: "" };
  }

  const output = await new Promise<string>((resolve) => {
    const child = spawn(resolved.bin, resolved.args, { cwd: current, env: process.env });
    let buf = "";
    const onData = (d: Buffer) => {
      buf += d.toString();
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => {
      buf += "\n[build-check] tsc timed out\n";
      child.kill("SIGKILL");
    }, TSC_TIMEOUT_MS);
    child.on("close", () => {
      clearTimeout(timer);
      resolve(buf);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve(`${buf}\n[build-check] spawn failed: ${err.message}`);
    });
  });

  const errors = parseTscOutput(output);
  return { ok: errors.length === 0, errors, output, tscPath: resolved.bin };
}
