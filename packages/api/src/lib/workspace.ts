import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/* ============================================================
   Generated-workspace materialisation.

   Each builder project gets a directory under generated-workspaces/:

     generated-workspaces/<projectId>/
       current/                  <- the live Expo project (what previews run from)
       runs/<runId>/before/      <- snapshot of current/ before a revision
       runs/<runId>/after/       <- snapshot of current/ after a revision

   node_modules/, .expo/ and dist/ are build artifacts: they live inside
   current/ but are NEVER deleted by a sync and never snapshotted/listed.
   ============================================================ */

const ARTIFACT_DIRS = new Set(["node_modules", ".expo", "dist"]);

export interface WorkspaceFile {
  path: string;
  contents: string;
}

export interface SyncResult {
  written: string[];
  deleted: string[];
  skipped: string[];
}

let cachedRoot: string | null = null;

/** Repo root = nearest ancestor containing pnpm-workspace.yaml; fallback cwd. */
async function findRepoRoot(start: string): Promise<string> {
  let dir = start;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await fs.access(path.join(dir, "pnpm-workspace.yaml"), fsConstants.F_OK);
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return start;
      dir = parent;
    }
  }
}

/** Absolute path to generated-workspaces/. WORKSPACES_DIR overrides. */
export async function workspaceRoot(): Promise<string> {
  if (process.env.WORKSPACES_DIR) return path.resolve(process.env.WORKSPACES_DIR);
  if (cachedRoot) return cachedRoot;
  const repoRoot = await findRepoRoot(process.cwd());
  cachedRoot = path.join(repoRoot, "generated-workspaces");
  return cachedRoot;
}

async function projectDir(projectId: string): Promise<string> {
  return path.join(await workspaceRoot(), projectId);
}

/** Whether a relative path's first segment is a protected build-artifact dir. */
function isArtifactPath(rel: string): boolean {
  const first = rel.split(/[/\\]/)[0] ?? "";
  return ARTIFACT_DIRS.has(first);
}

/**
 * Resolve a candidate file path inside `base`, rejecting absolute paths,
 * `..` escapes and anything that resolves outside `base`. Returns the absolute
 * target on success, or null if the path is unsafe.
 */
function safeResolve(base: string, rel: string): string | null {
  if (!rel || path.isAbsolute(rel)) return null;
  if (rel.split(/[/\\]/).some((seg) => seg === "..")) return null;
  const target = path.resolve(base, rel);
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  if (target !== base && !target.startsWith(prefix)) return null;
  return target;
}

/** Recursively list relative file paths under `dir`, skipping artifact dirs. */
async function listFiles(dir: string, opts: { skipArtifacts: boolean } = { skipArtifacts: true }): Promise<string[]> {
  const out: string[] = [];
  async function walk(abs: string, rel: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (opts.skipArtifacts && !rel && ARTIFACT_DIRS.has(entry.name)) continue;
      if (entry.isDirectory()) {
        await walk(path.join(abs, entry.name), childRel);
      } else if (entry.isFile()) {
        out.push(childRel);
      }
    }
  }
  await walk(dir, "");
  return out.sort();
}

/** Copy a directory tree (files only) into dest, skipping artifact dirs. */
async function copyTree(src: string, dest: string): Promise<void> {
  const files = await listFiles(src);
  for (const rel of files) {
    const from = path.join(src, rel);
    const to = path.join(dest, rel);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Materialise `files` into <project>/current/. When `runId` is given and a
 * current/ tree already exists, snapshot it to runs/<runId>/before/ first and
 * runs/<runId>/after/ once the sync lands. Stale files (present in current/ but
 * not in the new set) are removed — never the protected build-artifact dirs.
 */
export async function syncWorkspace(
  projectId: string,
  files: WorkspaceFile[],
  runId?: string,
): Promise<SyncResult> {
  const root = await projectDir(projectId);
  const current = path.join(root, "current");
  const written: string[] = [];
  const skipped: string[] = [];

  const safeTargets = new Map<string, WorkspaceFile>(); // rel -> file
  for (const file of files) {
    const safe = safeResolve(current, file.path);
    if (!safe || isArtifactPath(file.path)) {
      skipped.push(file.path);
      continue;
    }
    safeTargets.set(file.path.split(/\\/).join("/"), file);
  }

  // Before-snapshot of the existing current/ tree.
  if (runId && (await exists(current))) {
    await copyTree(current, path.join(root, "runs", runId, "before"));
  }

  await fs.mkdir(current, { recursive: true });

  // Write the new file set.
  for (const [rel, file] of safeTargets) {
    const to = path.join(current, rel);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.writeFile(to, file.contents, "utf8");
    written.push(rel);
  }

  // Delete stale files (non-artifact) no longer in the new set.
  const deleted: string[] = [];
  const existing = await listFiles(current);
  const keep = new Set(safeTargets.keys());
  for (const rel of existing) {
    if (keep.has(rel)) continue;
    await fs.rm(path.join(current, rel), { force: true });
    deleted.push(rel);
  }

  // After-snapshot.
  if (runId) {
    await copyTree(current, path.join(root, "runs", runId, "after"));
  }

  written.sort();
  deleted.sort();
  skipped.sort();
  return { written, deleted, skipped };
}

/** Relative paths in <project>/current/ (excluding build artifacts). */
export async function readWorkspaceTree(projectId: string): Promise<string[]> {
  const current = path.join(await projectDir(projectId), "current");
  if (!(await exists(current))) return [];
  return listFiles(current);
}

/** Delete oldest run-snapshot dirs beyond `keep` (most-recent kept). */
export async function pruneRuns(projectId: string, keep = 5): Promise<string[]> {
  const runsDir = path.join(await projectDir(projectId), "runs");
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(runsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (dirs.length <= keep) return [];

  // Order by mtime (oldest first) so we drop the stalest snapshots.
  const withMtime = await Promise.all(
    dirs.map(async (name) => {
      const stat = await fs.stat(path.join(runsDir, name));
      return { name, mtime: stat.mtimeMs };
    }),
  );
  withMtime.sort((a, b) => a.mtime - b.mtime);

  const removed: string[] = [];
  for (const { name } of withMtime.slice(0, withMtime.length - keep)) {
    await fs.rm(path.join(runsDir, name), { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}
