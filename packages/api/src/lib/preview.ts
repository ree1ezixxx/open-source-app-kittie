import { type ChildProcess, spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { workspaceRoot } from "./workspace.js";

/* ============================================================
   Live-preview process manager.

   Each builder project can run its generated Expo app as a web dev server
   (`expo start --web`). One preview per project; restarting stops the old
   one first. Sessions live in-memory only — restarting the API drops them
   (and the SIGINT/SIGTERM handlers kill the child process groups).

   Lifecycle: installing -> starting -> ready | failed | stopped.
   ============================================================ */

const PORT_MIN = 19100;
const PORT_MAX = 19199;
const LOG_TAIL_MAX = 200;
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const READY_TIMEOUT_MS = 120 * 1000;
const HEALTH_POLL_MS = 1500;
const REAP_INTERVAL_MS = 60 * 1000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export type PreviewStatus = "installing" | "starting" | "ready" | "failed" | "stopped";

export type LogLevel = "info" | "warn" | "error";
export type LogSource = "npm" | "expo" | "system";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  source: LogSource;
  line: string;
}

export interface PreviewSession {
  projectId: string;
  port: number;
  pid: number | null;
  status: PreviewStatus;
  url: string | null;
  startedAt: number;
  lastHealthAt: number | null;
  lastAccessAt: number;
  error?: string;
  logTail: LogEntry[];
  /** non-serialised internals */
  child?: ChildProcess;
}

export interface PreviewView {
  projectId: string;
  port: number;
  pid: number | null;
  status: PreviewStatus;
  url: string | null;
  startedAt: number;
  lastHealthAt: number | null;
  error?: string;
  logTail: LogEntry[];
}

const sessions = new Map<string, PreviewSession>();

/* ---- helpers ----------------------------------------------------------- */

/** Heuristic level for a stdout/stderr line. stderr defaults to warn; any line
 *  matching /error/i is an error; bundling/ready progress stays info. */
function classifyLevel(line: string, stderr: boolean): LogLevel {
  if (/\b(error|failed|cannot|exception|unhandled)\b/i.test(line)) return "error";
  if (stderr) return "warn";
  if (/\bwarn(ing)?\b/i.test(line)) return "warn";
  return "info";
}

/** Pull an Expo "bundling" progress signal out of a line, if present, so the
 *  boot overlay shows life while the bundler grinds. */
function bundlingHint(line: string): string | null {
  const m = line.match(/bundl(?:e|ing)[^\n]*?(\d{1,3}%|complete|finished|\d+ms)?/i);
  return m ? m[0].trim() : null;
}

interface PushOpts {
  source?: LogSource;
  stderr?: boolean;
  level?: LogLevel;
}

function pushEntry(session: PreviewSession, entry: LogEntry): void {
  session.logTail.push(entry);
  if (session.logTail.length > LOG_TAIL_MAX) {
    session.logTail.splice(0, session.logTail.length - LOG_TAIL_MAX);
  }
}

function pushLog(session: PreviewSession, chunk: string, opts: PushOpts = {}): void {
  const source = opts.source ?? "system";
  for (const raw of chunk.split(/\r?\n/)) {
    const line = raw.replace(/\[[0-9;]*m/g, "").trimEnd();
    if (!line) continue;
    const level = opts.level ?? classifyLevel(line, opts.stderr ?? false);
    pushEntry(session, { ts: Date.now(), level, source, line });
    // Surface bundling progress explicitly (still info-level) so the overlay moves.
    if (source === "expo" && /bundl/i.test(line)) {
      const hint = bundlingHint(line);
      if (hint && hint.toLowerCase() !== line.toLowerCase()) {
        pushEntry(session, { ts: Date.now(), level: "info", source: "expo", line: `bundling: ${hint}` });
      }
    }
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

/** True if something is already listening on the port. */
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    const done = (used: boolean) => {
      socket.destroy();
      resolve(used);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(400, () => done(false));
  });
}

async function allocatePort(): Promise<number> {
  const taken = new Set<number>();
  for (const s of sessions.values()) {
    if (s.status !== "stopped" && s.status !== "failed") taken.add(s.port);
  }
  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    if (taken.has(port)) continue;
    if (await portInUse(port)) continue;
    return port;
  }
  throw new Error(`no free preview port in ${PORT_MIN}-${PORT_MAX}`);
}

/** HTTP 200 healthcheck against the dev server root. */
function healthcheck(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = net.createConnection({ port, host: "127.0.0.1" }, () => {
      req.write("GET / HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n");
    });
    let data = "";
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
    req.on("data", (b) => {
      data += b.toString("utf8");
      if (data.length > 64) {
        req.destroy();
        resolve(/^HTTP\/1\.[01] (200|30\d)/.test(data));
      }
    });
    req.on("end", () => resolve(/^HTTP\/1\.[01] (200|30\d)/.test(data)));
    req.on("error", () => resolve(false));
  });
}

/** Kill the detached process group (negative pid) then the leader. */
function killTree(child: ChildProcess | undefined): void {
  if (!child || child.pid == null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function currentDir(projectId: string, root: string): string {
  return path.join(root, projectId, "current");
}

/* ---- public API -------------------------------------------------------- */

export function toView(session: PreviewSession, logLines = 50): PreviewView {
  return {
    projectId: session.projectId,
    port: session.port,
    pid: session.pid,
    status: session.status,
    url: session.url,
    startedAt: session.startedAt,
    lastHealthAt: session.lastHealthAt,
    error: session.error,
    logTail: session.logTail.slice(-logLines),
  };
}

export function getPreview(projectId: string): PreviewSession | null {
  const s = sessions.get(projectId);
  if (s) s.lastAccessAt = Date.now();
  return s ?? null;
}

export function listPreviews(): PreviewSession[] {
  return [...sessions.values()];
}

export function stopPreview(projectId: string): PreviewSession | null {
  const s = sessions.get(projectId);
  if (!s) return null;
  killTree(s.child);
  s.child = undefined;
  s.pid = null;
  s.status = "stopped";
  s.url = null;
  return s;
}

/**
 * Start (or restart) the web preview for a project. Returns the session
 * immediately in 'installing'/'starting' state; the install + boot + ready
 * healthcheck run async and mutate the session in place. Poll getPreview().
 */
export async function startPreview(projectId: string): Promise<PreviewSession> {
  const prior = sessions.get(projectId);
  if (prior) {
    // Idempotent revalidating start: if a session claims to be ready, trust it
    // only if the port still answers. A live one is returned untouched (no
    // disruptive restart); a dead one is cleaned up and started fresh.
    if (prior.status === "ready" && (await healthcheck(prior.port))) {
      prior.lastHealthAt = Date.now();
      prior.lastAccessAt = Date.now();
      pushLog(prior, "[preview] already running — reusing live session", { source: "system" });
      return prior;
    }
    killTree(prior.child);
    sessions.delete(projectId);
  }

  const root = await workspaceRoot();
  const cwd = currentDir(projectId, root);
  if (!(await exists(cwd))) {
    throw new Error("workspace not synced");
  }

  const port = await allocatePort();
  const now = Date.now();
  const session: PreviewSession = {
    projectId,
    port,
    pid: null,
    status: "installing",
    url: null,
    startedAt: now,
    lastHealthAt: null,
    lastAccessAt: now,
    logTail: [],
  };
  sessions.set(projectId, session);

  // Drive the rest asynchronously; surface failures into the session.
  void runStart(session, cwd).catch((err) => {
    session.status = "failed";
    session.error = err instanceof Error ? err.message : String(err);
    pushLog(session, `[preview] ${session.error}`);
  });

  return session;
}

async function runStart(session: PreviewSession, cwd: string): Promise<void> {
  const nodeModules = path.join(cwd, "node_modules");
  if (!(await exists(nodeModules))) {
    session.status = "installing";
    pushLog(session, "[preview] installing dependencies (npm install)…");
    await runInstall(session, cwd);
  } else {
    pushLog(session, "[preview] node_modules present — skipping install");
  }

  // Guard: a stop() may have landed mid-install.
  if (session.status === "stopped") return;

  session.status = "starting";
  pushLog(session, `[preview] starting expo web on :${session.port}…`);
  await spawnExpo(session, cwd);
}

function runInstall(session: PreviewSession, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["install", "--no-audit", "--no-fund"], {
      cwd,
      env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
    });
    session.child = child;
    session.pid = child.pid ?? null;

    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error("dependency install timed out"));
    }, INSTALL_TIMEOUT_MS);

    child.stdout?.on("data", (b) => pushLog(session, b.toString("utf8"), { source: "npm" }));
    child.stderr?.on("data", (b) => pushLog(session, b.toString("utf8"), { source: "npm", stderr: true }));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      session.child = undefined;
      session.pid = null;
      if (code === 0) resolve();
      else reject(new Error(`npm install exited with code ${code}`));
    });
  });
}

async function spawnExpo(session: PreviewSession, cwd: string): Promise<void> {
  const child = spawn(
    "npx",
    ["expo", "start", "--web", "--port", String(session.port)],
    {
      cwd,
      detached: true, // own process group so we can kill the whole tree
      env: {
        ...process.env,
        CI: "1",
        EXPO_NO_TELEMETRY: "1",
        BROWSER: "none",
      },
    },
  );
  session.child = child;
  session.pid = child.pid ?? null;

  let exited = false;
  child.stdout?.on("data", (b) => pushLog(session, b.toString("utf8"), { source: "expo" }));
  child.stderr?.on("data", (b) => pushLog(session, b.toString("utf8"), { source: "expo", stderr: true }));
  child.on("error", (err) => {
    exited = true;
    session.status = "failed";
    session.error = err instanceof Error ? err.message : String(err);
  });
  child.on("exit", (code) => {
    exited = true;
    session.child = undefined;
    session.pid = null;
    if (session.status !== "ready" && session.status !== "stopped") {
      session.status = "failed";
      session.error = `expo exited with code ${code} before ready`;
    } else if (session.status === "ready") {
      // Bundler died after going live.
      session.status = "failed";
      session.error = `expo exited with code ${code}`;
    }
  });

  // Poll for readiness.
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited || session.status === "stopped") return;
    if (await healthcheck(session.port)) {
      session.status = "ready";
      session.url = `http://localhost:${session.port}/`;
      session.lastHealthAt = Date.now();
      pushLog(session, `[preview] ready at ${session.url}`);
      return;
    }
    await delay(HEALTH_POLL_MS);
  }
  if (session.status !== "stopped") {
    session.status = "failed";
    session.error = "expo web did not become ready within timeout";
    killTree(child);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ---- reaper + shutdown ------------------------------------------------- */

let reaper: ReturnType<typeof setInterval> | null = null;

export function startPreviewReaper(): void {
  if (reaper) return;
  reaper = setInterval(() => {
    void reapOnce();
  }, REAP_INTERVAL_MS);
  if (reaper.unref) reaper.unref();
}

async function reapOnce(): Promise<void> {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.status === "ready") {
      const alive = await healthcheck(session.port);
      if (alive) {
        session.lastHealthAt = now;
      } else {
        session.status = "failed";
        session.error = "healthcheck failed (process likely died)";
        killTree(session.child);
        session.child = undefined;
        session.pid = null;
      }
      if (now - session.lastAccessAt > IDLE_TIMEOUT_MS) {
        pushLog(session, "[preview] stopping idle session");
        stopPreview(session.projectId);
      }
    }
  }
}

let shutdownHooked = false;

export function installPreviewShutdownHooks(): void {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const killAll = () => {
    for (const s of sessions.values()) killTree(s.child);
  };
  process.on("exit", killAll);
  process.once("SIGINT", () => {
    killAll();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    killAll();
    process.exit(0);
  });
}
