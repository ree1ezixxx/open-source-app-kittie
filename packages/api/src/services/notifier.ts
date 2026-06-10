import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Optional macOS banner channel for Alerts. The in-app feed is canonical
 * (Alert rows written by the capture sweep, not here) — banners are a
 * setting-gated extra fired from the API process, so they reach the user
 * with the browser tab closed, but only while the API is up.
 */

const execFileAsync = promisify(execFile);

/** One Alert rendered for delivery: the Tracked app, the rule that fired, what changed. */
export interface AlertMessage {
  appTitle: string;
  rule: string;
  summary: string;
}

/** Minimal exec surface so tests can inject a fake instead of spawning osascript. */
export type ExecFileLike = (cmd: string, args: string[]) => Promise<unknown>;

/** Banner body budget — macOS truncates long notification bodies anyway. */
const MAX_BODY_LENGTH = 120;

const defaultExec: ExecFileLike = (cmd, args) => execFileAsync(cmd, args);

/** AppleScript string literal escaping: backslashes first, then double quotes. */
function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function ellipsize(value: string): string {
  if (value.length <= MAX_BODY_LENGTH) return value;
  return `${value.slice(0, MAX_BODY_LENGTH - 1)}…`;
}

/**
 * Render an Alert as banner title + body. The app title headlines; the body
 * is the change summary, with the rule woven in only when the summary does
 * not already name it.
 */
export function formatBanner(msg: AlertMessage): { title: string; body: string } {
  const ruleMentioned = msg.summary.toLowerCase().includes(msg.rule.toLowerCase());
  const body = ruleMentioned ? msg.summary : `${msg.rule}: ${msg.summary}`;
  return { title: msg.appTitle, body: ellipsize(body) };
}

/** Banners are opt-in (off by default) and only meaningful on macOS. */
export function bannersEnabled(env?: NodeJS.ProcessEnv): boolean {
  return (env ?? process.env).ALERT_BANNERS === "1" && process.platform === "darwin";
}

async function deliver(
  title: string,
  body: string,
  opts?: { exec?: ExecFileLike; env?: NodeJS.ProcessEnv },
): Promise<boolean> {
  if (!bannersEnabled(opts?.env)) return false;
  const exec = opts?.exec ?? defaultExec;
  const script = `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`;
  try {
    await exec("osascript", ["-e", script]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fire a macOS banner for one Alert. Never throws — a failed banner must
 * never break a sweep. Resolves false when banners are disabled or osascript
 * fails, true on delivery.
 */
export async function sendBanner(
  msg: AlertMessage,
  opts?: { exec?: ExecFileLike; env?: NodeJS.ProcessEnv },
): Promise<boolean> {
  const { title, body } = formatBanner(msg);
  return deliver(title, body, opts);
}

/**
 * Fire the daily roll-up banner: alert count in the title, the headline
 * change as the body. Same gating and failure contract as sendBanner.
 */
export async function sendDailyDigestBanner(
  count: number,
  topLine: string,
  opts?: { exec?: ExecFileLike; env?: NodeJS.ProcessEnv },
): Promise<boolean> {
  return deliver(`Kittie: ${count} alerts today`, topLine, opts);
}
