#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { AppListItem } from "@kittie/types";
import { cloneIos, getAppDetail, getHealth, searchApps } from "./client.js";
import { DEFAULT_API_ORIGIN, normalizeOrigin, readConfig, resolveConfig, writeConfig } from "./config.js";
import { formatMoney, printJson, table } from "./output.js";

interface GlobalOptions {
  apiOrigin?: string;
  authToken?: string;
  json: boolean;
}

interface ParsedArgs {
  command?: string;
  args: string[];
  options: GlobalOptions;
}

const HELP = `Usage:
  kittie help
  kittie doctor [--json] [--api-origin <url>]
  kittie config show [--json]
  kittie config set apiOrigin <url>

Existing app commands:
  kittie search [query] [--json]
  kittie trends [--json]
  kittie detail <id> [--json]
  kittie clone-ios <id> [--out <dir>]

Config precedence:
  --api-origin, KITTIE_API_ORIGIN, ~/.kittie/config.json, ${DEFAULT_API_ORIGIN}`;

function parseArgs(argv: string[]): ParsedArgs {
  const args: string[] = [];
  const options: GlobalOptions = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--api-origin" || arg === "--api-url") {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a URL`);
      options.apiOrigin = value;
      i += 1;
    } else if (arg === "--token") {
      const value = argv[i + 1];
      if (!value) throw new Error("--token requires a value");
      options.authToken = value;
      i += 1;
    } else if (arg === "-h" || arg === "--help") {
      args.push("help");
    } else {
      args.push(arg);
    }
  }
  const [command, ...rest] = args;
  return { command, args: rest, options };
}

function row(app: AppListItem): Record<string, string | number> {
  return {
    title: app.title.slice(0, 28),
    store: app.store,
    reviews: app.reviewCount,
    growth: app.growthScore?.toFixed(1) ?? "-",
    revenueEstimate30d: formatMoney(app.revenueEstimate30d),
    firstMover: app.isFirstMover ? "yes" : "no",
  };
}

async function cmdSearch(args: string[], options: GlobalOptions) {
  const config = resolveConfig(options);
  const result = await searchApps({ search: args[0], limit: 20, sortBy: "growth" }, config);
  if (options.json) return printJson(result);
  console.log(table(result.data.map(row)));
  console.log(`\n${result.pagination.totalCount} apps`);
}

async function cmdTrends(options: GlobalOptions) {
  const config = resolveConfig(options);
  const result = await searchApps({ sortBy: "growth", sortOrder: "desc", limit: 10 }, config);
  if (options.json) return printJson(result);
  console.log(table(result.data.map(row)));
}

async function cmdDetail(id: string | undefined, options: GlobalOptions) {
  if (!id) throw new Error("App id required");
  const config = resolveConfig(options);
  const app = await getAppDetail(id, config);
  if (options.json) return printJson(app);
  console.log(
    table([
      { field: "Title", value: `${app.title} (${app.store})` },
      { field: "Developer", value: app.developer },
      { field: "Category", value: app.category ?? "-" },
      { field: "Rating", value: `${app.rating ?? "-"} (${app.reviewCount} reviews)` },
      { field: "Growth score", value: `${app.growthScore ?? "-"}${app.isFirstMover ? " FIRST MOVER" : ""}` },
      { field: "Revenue estimate 30d", value: formatMoney(app.revenueEstimate30d) },
      { field: "Downloads estimate 30d", value: app.downloadsEstimate30d?.toLocaleString() ?? "-" },
    ]),
  );
  if (app.description) console.log(`\n${app.description}`);
}

async function cmdCloneIos(args: string[], options: GlobalOptions) {
  const appId = args[0];
  if (!appId) throw new Error("App id required: kittie clone-ios <appId> [--out <dir>]");
  const outFlag = args.indexOf("--out");
  const config = resolveConfig(options);
  const result = await cloneIos(appId, config);
  const outDir = resolve(outFlag >= 0 && args[outFlag + 1] ? args[outFlag + 1]! : `./${result.projectName}`);
  for (const f of result.files) {
    const p = join(outDir, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.contents);
  }
  console.log(`Cloned "${result.sourceTitle}" -> ${result.blueprint.appName}`);
  console.log(`Wrote ${result.files.length} files to ${outDir}`);
}

async function cmdDoctor(options: GlobalOptions) {
  const config = resolveConfig(options);
  const started = Date.now();
  try {
    const health = await getHealth(config);
    const result = {
      ok: health.ok,
      apiOrigin: config.apiOrigin,
      configSource: config.source,
      status: health.status,
      latencyMs: Date.now() - started,
    };
    if (!health.ok) process.exitCode = 1;
    if (options.json) return printJson(result);
    console.log(table([result]));
  } catch (error) {
    const result = {
      ok: false,
      apiOrigin: config.apiOrigin,
      configSource: config.source,
      error: error instanceof Error ? error.message : String(error),
    };
    process.exitCode = 1;
    if (options.json) return printJson(result);
    console.log(table([result]));
  }
}

function cmdConfig(args: string[], options: GlobalOptions) {
  const action = args[0] ?? "show";
  const pathConfig = readConfig();
  if (action === "show") {
    const resolved = resolveConfig(options);
    const output = {
      path: resolved.path,
      apiOrigin: resolved.apiOrigin,
      authToken: resolved.authToken ? "(set from flag/env)" : null,
      source: resolved.source,
    };
    if (options.json) return printJson(output);
    return console.log(table([output]));
  }

  if (action === "set") {
    const key = args[1];
    const value = args[2];
    if (!key || !value) throw new Error("Usage: kittie config set apiOrigin <url>");
    if (key === "authToken") throw new Error("Auth tokens must be provided with --token or KITTIE_AUTH_TOKEN");
    if (key !== "apiOrigin") throw new Error(`Unknown config key: ${key}`);
    const next = { ...pathConfig, [key]: normalizeOrigin(value) };
    writeConfig(next);
    console.log(`${key} saved`);
    return;
  }

  if (action === "unset") {
    const key = args[1];
    if (key === "authToken") throw new Error("Auth tokens are not stored in kittie config");
    if (key !== "apiOrigin") throw new Error("Usage: kittie config unset apiOrigin");
    const next = { ...pathConfig };
    delete next[key];
    writeConfig(next);
    console.log(`${key} unset`);
    return;
  }

  throw new Error(`Unknown config action: ${action}`);
}

export async function run(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  switch (parsed.command) {
    case undefined:
    case "help":
      console.log(HELP);
      return;
    case "doctor":
      return cmdDoctor(parsed.options);
    case "config":
      return cmdConfig(parsed.args, parsed.options);
    case "search":
      return cmdSearch(parsed.args, parsed.options);
    case "trends":
      return cmdTrends(parsed.options);
    case "detail":
      return cmdDetail(parsed.args[0], parsed.options);
    case "clone-ios":
      return cmdCloneIos(parsed.args, parsed.options);
    default:
      console.error(`Unknown command: ${parsed.command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
