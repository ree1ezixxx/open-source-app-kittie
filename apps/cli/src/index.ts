#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { AppListItem } from "@kittie/types";
import { cloneIos, getAppDetail, searchApps } from "./client.js";
import {
  configPath,
  loadConfig,
  loadStoredConfig,
  saveStoredConfig,
} from "./config.js";
import { detectMode, formatOutput, type OutputMode } from "./output.js";
import { formatDoctorHuman, runDoctor } from "./doctor.js";
import { buildUsage } from "./help.js";

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

function formatRow(app: AppListItem): string {
  const growth = app.growthScore?.toFixed(1) ?? "—";
  const flag = app.isFirstMover ? " 🚀" : "";
  return [
    app.title.padEnd(22).slice(0, 22),
    app.store.padEnd(6),
    String(app.reviewCount).padStart(6),
    growth.padStart(6),
    formatMoney(app.revenueEstimate30d).padStart(8),
    flag,
  ].join("  ");
}

async function cmdSearch(args: string[]) {
  const search = args[0];
  const result = await searchApps({ search, limit: 20, sortBy: "growth" });
  printHeader();
  for (const app of result.data) console.log(formatRow(app));
  console.log(`\n${result.pagination.totalCount} apps`);
}

async function cmdTrends() {
  const result = await searchApps({ sortBy: "growth", sortOrder: "desc", limit: 10 });
  printHeader();
  for (const app of result.data) console.log(formatRow(app));
}

async function cmdDetail(id: string) {
  const app = await getAppDetail(id);
  console.log(`\n${app.title} (${app.store})`);
  console.log(`Developer: ${app.developer}`);
  console.log(`Category: ${app.category ?? "—"}`);
  console.log(`Rating: ${app.rating ?? "—"} (${app.reviewCount} reviews)`);
  console.log(`Growth score: ${app.growthScore ?? "—"}${app.isFirstMover ? " — FIRST MOVER" : ""}`);
  console.log(`Revenue est (30d): ${formatMoney(app.revenueEstimate30d)}`);
  console.log(`Downloads est (30d): ${app.downloadsEstimate30d?.toLocaleString() ?? "—"}`);
  if (app.description) console.log(`\n${app.description}`);
  if (app.metaAds.length) console.log(`\nMeta ads: ${app.metaAds.length}`);
  if (app.creators.length) console.log(`Creators: ${app.creators.map((c) => c.handle).join(", ")}`);
}

async function cmdCloneIos(args: string[]) {
  const appId = args[0];
  if (!appId) {
    console.error("App id required:  pluto clone-ios <appId> [--out <dir>]");
    process.exit(1);
  }
  const outFlag = args.indexOf("--out");
  const result = await cloneIos(appId);
  const outDir = resolve(outFlag >= 0 && args[outFlag + 1] ? args[outFlag + 1]! : `./${result.projectName}`);
  for (const f of result.files) {
    const p = join(outDir, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.contents);
  }
  console.log(`\n🐱  Cloned "${result.sourceTitle}"  →  ${result.blueprint.appName}`);
  console.log(`    ${result.blueprint.tagline}`);
  console.log(`    accent ${result.blueprint.accentHex} · ${result.blueprint.primaryEntity} · ${result.aiGenerated ? "AI-designed" : "template"}${result.cached ? " (cached)" : ""}`);
  console.log(`    screens: ${result.blueprint.tabs.map((t) => `${t.title}(${t.kind})`).join(", ")}`);
  console.log(`\n    Wrote ${result.files.length} files to ${outDir}\n`);
  console.log("    Build it:");
  console.log(`      cd ${outDir}`);
  for (const cmd of result.buildCommands) console.log(`      ${cmd}`);
  console.log();
}

async function cmdDoctor(mode: OutputMode) {
  const cfg = loadConfig();
  const report = await runDoctor({ apiBaseUrl: cfg.apiBaseUrl, authToken: cfg.authToken });
  console.log(formatOutput(mode, report, () => formatDoctorHuman(report)));
  if (!report.ok) process.exitCode = 1;
}

function cmdConfig(args: string[], mode: OutputMode) {
  const path = configPath();
  if (args[0] === "set") {
    const key = args[1];
    const value = args[2];
    if (!key || value === undefined) {
      console.error("Usage: pluto config set <api-url|token> <value>");
      process.exit(1);
    }
    if (value.trim().length === 0) {
      console.error(`Empty value for ${key}. To clear it, remove the entry from ${path}.`);
      process.exit(1);
    }
    const stored = loadStoredConfig(path);
    if (key === "api-url") stored.apiBaseUrl = value;
    else if (key === "token") stored.authToken = value;
    else {
      console.error(`Unknown config key: ${key} (expected "api-url" or "token")`);
      process.exit(1);
    }
    saveStoredConfig(path, stored);
    console.log(formatOutput(mode, { saved: true, path, key }, () => `Saved ${key} → ${path}`));
    return;
  }
  const cfg = loadConfig();
  // Never echo the token value (even in --json) — report only whether it is set.
  const shown = { apiBaseUrl: cfg.apiBaseUrl, authToken: cfg.authToken ? "set" : null, configPath: path };
  console.log(
    formatOutput(mode, shown, () =>
      [
        `Config file: ${path}`,
        `API base URL: ${cfg.apiBaseUrl}`,
        `Auth token: ${cfg.authToken ? "set" : "—"}`,
      ].join("\n"),
    ),
  );
}

function printHeader() {
  console.log(
    ["Title".padEnd(22), "Store".padEnd(6), "Reviews".padStart(6), "Growth".padStart(6), "Revenue".padStart(8)].join(
      "  ",
    ),
  );
  console.log("-".repeat(60));
}

function usage() {
  console.log(buildUsage());
}

async function main() {
  const { mode, rest } = detectMode(process.argv.slice(2));
  const [cmd, ...args] = rest;

  try {
    switch (cmd) {
      case "help":
        usage();
        break;
      case "doctor":
        await cmdDoctor(mode);
        break;
      case "config":
        cmdConfig(args, mode);
        break;
      case "search":
        await cmdSearch(args);
        break;
      case "trends":
        await cmdTrends();
        break;
      case "detail":
        if (!args[0]) {
          console.error("App id required");
          process.exit(1);
        }
        await cmdDetail(args[0]);
        break;
      case "clone-ios":
        await cmdCloneIos(args);
        break;
      default:
        usage();
        process.exit(cmd ? 1 : 0);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
