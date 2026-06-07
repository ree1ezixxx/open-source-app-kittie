#!/usr/bin/env node
import type { AppListItem } from "@kittie/types";
import { getAppDetail, searchApps } from "./client.js";

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

function printHeader() {
  console.log(
    ["Title".padEnd(22), "Store".padEnd(6), "Reviews".padStart(6), "Growth".padStart(6), "Revenue".padStart(8)].join(
      "  ",
    ),
  );
  console.log("-".repeat(60));
}

function usage() {
  console.log(`Usage:
  pluto search [query]   Search apps
  pluto trends           Top growth movers
  pluto detail <id>      App detail`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  try {
    switch (cmd) {
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
