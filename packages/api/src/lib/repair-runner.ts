import fs from "node:fs/promises";
import path from "node:path";

import {
  classify,
  errorSignature,
  proposeRepair,
  type AppBlueprint,
  type Diagnostic,
} from "@kittie/clone-engine";

import { runBuildCheck } from "./build-check.js";
import { emitRunEvent } from "./run-events.js";
import { workspaceRoot } from "./workspace.js";

/* ============================================================
   Build/repair loop — drives runBuildCheck + deterministic repair against a
   project's current/ workspace, emitting the run-timeline events the UI shows.

   - build check; if clean, done.
   - on errors: emit error_detected, then attempt up to MAX_ATTEMPTS:
       emit repair_attempt -> propose patches -> write to workspace -> re-check.
   - bail early if the same error signature repeats STUCK_LIMIT times (a repair
     that doesn't move the needle) or no deterministic patch is available.
   ============================================================ */

const MAX_ATTEMPTS = 5;
const STUCK_LIMIT = 3;

export interface RepairOutcome {
  ok: boolean;
  attempts: number;
  /** count of build issues we successfully self-repaired (0 if clean first pass) */
  repaired: number;
  /** remaining diagnostics if we couldn't fix everything */
  errors: Diagnostic[];
  /** brief diagnosis for the assistant summary on failure */
  diagnosis: string;
}

async function readWorkspaceSources(projectId: string, rels: string[]): Promise<Record<string, string>> {
  const current = path.join(await workspaceRoot(), projectId, "current");
  const out: Record<string, string> = {};
  for (const rel of rels) {
    try {
      out[rel] = await fs.readFile(path.join(current, rel), "utf8");
    } catch {
      /* file may not exist (e.g. deleted) — skip */
    }
  }
  return out;
}

async function writeWorkspaceFile(projectId: string, rel: string, contents: string): Promise<void> {
  const current = path.join(await workspaceRoot(), projectId, "current");
  const to = path.join(current, rel);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.writeFile(to, contents, "utf8");
}

/**
 * Run the validate -> repair loop. Emits run events under `runId`. Returns the
 * outcome so the caller can write an honest assistant summary.
 */
export async function runRepairLoop(
  runId: string,
  projectId: string,
  blueprint: AppBlueprint,
): Promise<RepairOutcome> {
  let check = await runBuildCheck(projectId);
  if (check.ok) {
    emitRunEvent(runId, { type: "log", level: "info", line: "Build check passed (tsc --noEmit)" });
    return { ok: true, attempts: 0, repaired: 0, errors: [], diagnosis: "" };
  }

  const initialErrorCount = check.errors.length;
  const first = check.errors[0];
  const initialSources = await readWorkspaceSources(projectId, [
    ...new Set(check.errors.map((d) => d.file)),
  ]);
  emitRunEvent(runId, {
    type: "error_detected",
    category: classify(check.errors, initialSources),
    message: first ? `${first.code}: ${first.message}` : `${initialErrorCount} build errors`,
    file: first?.file,
    line: `Build check found ${initialErrorCount} error${initialErrorCount === 1 ? "" : "s"}`,
  });

  let lastSignature = errorSignature(check.errors);
  let stuck = 0;
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS && !check.ok) {
    attempt += 1;
    emitRunEvent(runId, { type: "repair_attempt", attempt, max: MAX_ATTEMPTS });

    const brokenRels = [...new Set(check.errors.map((d) => d.file))];
    const sources = await readWorkspaceSources(projectId, brokenRels);
    const proposal = proposeRepair(check.errors, sources, blueprint);

    if (proposal.patches.length === 0) {
      emitRunEvent(runId, {
        type: "log",
        level: "warn",
        line: `No deterministic fix for ${proposal.category}; bailing`,
      });
      break;
    }

    for (const patch of proposal.patches) {
      await writeWorkspaceFile(projectId, patch.path, patch.contents);
      emitRunEvent(runId, { type: "file_changed", path: patch.path, repair: patch.strategy });
    }

    check = await runBuildCheck(projectId);
    if (check.ok) break;

    const sig = errorSignature(check.errors);
    if (sig === lastSignature) {
      stuck += 1;
      if (stuck >= STUCK_LIMIT) {
        emitRunEvent(runId, {
          type: "log",
          level: "warn",
          line: `Same errors after ${stuck} attempts; bailing`,
        });
        break;
      }
    } else {
      stuck = 0;
      lastSignature = sig;
    }
  }

  if (check.ok) {
    emitRunEvent(runId, {
      type: "log",
      level: "info",
      line: `Self-repaired ${initialErrorCount} build issue${initialErrorCount === 1 ? "" : "s"} in ${attempt} attempt${attempt === 1 ? "" : "s"}`,
    });
    return { ok: true, attempts: attempt, repaired: initialErrorCount, errors: [], diagnosis: "" };
  }

  const top = check.errors
    .slice(0, 3)
    .map((d) => `${d.file}(${d.line}): ${d.code} ${d.message}`)
    .join("; ");
  return {
    ok: false,
    attempts: attempt,
    repaired: 0,
    errors: check.errors,
    diagnosis: top,
  };
}
