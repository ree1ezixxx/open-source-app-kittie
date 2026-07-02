/**
 * Local-first CLI config. Resolution precedence (highest first):
 *   CLI overrides → env vars → stored config file → built-in default.
 * The stored file lives at `~/.kittie/config.json` (override the home dir with
 * `KITTIE_CONFIG_HOME`, mainly for tests). Nothing here talks to the network.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:3008";
export const ENV_API_URL = "KITTIE_API_URL";
export const ENV_API_TOKEN = "KITTIE_API_TOKEN";
export const ENV_CONFIG_HOME = "KITTIE_CONFIG_HOME";

export interface CliConfig {
  apiBaseUrl: string;
  authToken: string | null;
}

export interface StoredConfig {
  apiBaseUrl?: string;
  authToken?: string | null;
}

type Env = Record<string, string | undefined>;

function clean(value: unknown): string | undefined {
  // Only strings are valid — a hand-edited/externally-written config with a
  // non-string value (e.g. `{"apiBaseUrl": 3008}`) must not crash resolution.
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function configPath(env: Env = process.env): string {
  const home = clean(env[ENV_CONFIG_HOME]) ?? homedir();
  return join(home, ".kittie", "config.json");
}

export function loadStoredConfig(path: string): StoredConfig {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    // Reject non-objects and arrays (typeof [] === "object"); `clean()` guards
    // individual field types, so a wrong-typed value degrades to the default.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as StoredConfig;
  } catch {
    // A corrupt config file must never crash the CLI — treat as empty.
    return {};
  }
}

export function saveStoredConfig(path: string, config: StoredConfig): void {
  // The file can hold an auth token — keep it owner-only (dir 0700, file 0600).
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export interface ResolveInput {
  env?: Env;
  stored?: StoredConfig;
  overrides?: Partial<CliConfig>;
}

export function resolveConfig(input: ResolveInput = {}): CliConfig {
  const env = input.env ?? {};
  const stored = input.stored ?? {};
  const overrides = input.overrides ?? {};

  const apiBaseUrl =
    clean(overrides.apiBaseUrl) ??
    clean(env[ENV_API_URL]) ??
    clean(stored.apiBaseUrl) ??
    DEFAULT_API_BASE_URL;

  const authToken =
    clean(overrides.authToken) ??
    clean(env[ENV_API_TOKEN]) ??
    clean(stored.authToken) ??
    null;

  return { apiBaseUrl, authToken };
}

/** Load + resolve in one step, reading the stored file at the standard path. */
export function loadConfig(env: Env = process.env, overrides: Partial<CliConfig> = {}): CliConfig {
  return resolveConfig({ env, stored: loadStoredConfig(configPath(env)), overrides });
}
