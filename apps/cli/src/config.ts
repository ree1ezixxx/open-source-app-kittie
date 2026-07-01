import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_API_ORIGIN = "http://localhost:3008";

export interface KittieConfig {
  apiOrigin?: string;
  authToken?: string;
}

export interface ResolvedConfig {
  apiOrigin: string;
  authToken?: string;
  path: string;
  source: "flag" | "env" | "file" | "default";
}

export function configPath(): string {
  const root = process.env.KITTIE_CONFIG_HOME ?? join(homedir(), ".kittie");
  return join(root, "config.json");
}

export function readConfig(path = configPath()): KittieConfig {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as KittieConfig;
  return {
    apiOrigin: typeof parsed.apiOrigin === "string" ? parsed.apiOrigin : undefined,
    authToken: typeof parsed.authToken === "string" ? parsed.authToken : undefined,
  };
}

export function writeConfig(config: KittieConfig, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

export function normalizeOrigin(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function resolveConfig(options: { apiOrigin?: string; authToken?: string } = {}): ResolvedConfig {
  const path = configPath();
  const file = readConfig(path);
  const envOrigin = process.env.KITTIE_API_ORIGIN ?? process.env.KITTIE_API_URL;
  const origin = options.apiOrigin ?? envOrigin ?? file.apiOrigin ?? DEFAULT_API_ORIGIN;
  const token = options.authToken ?? process.env.KITTIE_AUTH_TOKEN ?? file.authToken;

  return {
    apiOrigin: normalizeOrigin(origin),
    authToken: token,
    path,
    source: options.apiOrigin ? "flag" : envOrigin ? "env" : file.apiOrigin ? "file" : "default",
  };
}
