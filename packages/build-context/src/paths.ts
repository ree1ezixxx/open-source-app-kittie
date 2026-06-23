/**
 * Resolves the on-disk layout. Project memory lives in `<projectDir>/.kittie/`
 * (travels with the user's repo); global preferences live in `~/.kittie/`
 * (ride across every project). Both roots are injectable so tests use temp dirs.
 */
import { homedir } from "node:os";
import { join } from "node:path";

export interface BuildContextPaths {
  /** The user's project root that owns the `.kittie/` folder. */
  projectDir: string;
  /** `<projectDir>/.kittie`. */
  kittieDir: string;
  /** The global root (`~/.kittie` by default). */
  globalDir: string;
  contextFile: string;
  memoryFile: string;
  decisionsFile: string;
  lockFile: string;
  buildPlanFile: string;
  launchPlanFile: string;
  globalPrefsFile: string;
  globalMemoryFile: string;
}

export interface ResolvePathsOptions {
  /** Defaults to `process.cwd()`. */
  projectDir?: string;
  /** Defaults to `~/.kittie`. */
  globalDir?: string;
}

export function resolvePaths(opts: ResolvePathsOptions = {}): BuildContextPaths {
  const projectDir = opts.projectDir ?? process.cwd();
  const globalDir = opts.globalDir ?? join(homedir(), ".kittie");
  const kittieDir = join(projectDir, ".kittie");
  return {
    projectDir,
    kittieDir,
    globalDir,
    contextFile: join(kittieDir, "context.json"),
    memoryFile: join(kittieDir, "memory.md"),
    decisionsFile: join(kittieDir, "decisions.jsonl"),
    lockFile: join(kittieDir, "market.lock.json"),
    buildPlanFile: join(kittieDir, "build-plan.md"),
    launchPlanFile: join(kittieDir, "launch-plan.json"),
    globalPrefsFile: join(globalDir, "preferences.json"),
    globalMemoryFile: join(globalDir, "memory.md"),
  };
}
