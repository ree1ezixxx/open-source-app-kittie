#!/usr/bin/env node
/**
 * Packaged-MCP startup check (#267) — proves the DOCUMENTED invocation works:
 * plain `node apps/mcp/dist/index.js`, no tsx, no TS loader. Speaks real MCP
 * over stdio: initialize → tools/list, asserts the catalog answers with the
 * decision-ladder tools present. This class of break (exports resolving to TS
 * source) is invisible to vitest, so CI runs this after the workspace build.
 *
 * Usage: node scripts/check-mcp-packaged.mjs   (exit 0 = pass)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "apps/mcp/dist/index.js");
if (!existsSync(entry)) {
  console.error(`FAIL: ${entry} missing — run pnpm build first`);
  process.exit(1);
}

const REQUIRED_TOOLS = ["cluster_reviews", "find_feature_gaps", "rank_whitespace_ideas", "search_apps"];
const proc = spawn("node", [entry], { stdio: ["pipe", "pipe", "inherit"] });

const timeout = setTimeout(() => {
  console.error("FAIL: no tools/list response within 20s");
  proc.kill();
  process.exit(1);
}, 20_000);

let buf = "";
proc.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id === 2) {
      clearTimeout(timeout);
      const names = (msg.result?.tools ?? []).map((t) => t.name);
      const missing = REQUIRED_TOOLS.filter((n) => !names.includes(n));
      if (names.length < 20 || missing.length > 0) {
        console.error(`FAIL: ${names.length} tools, missing: ${missing.join(", ") || "none"}`);
        proc.kill();
        process.exit(1);
      }
      console.log(`PASS: packaged MCP answered tools/list with ${names.length} tools under plain node`);
      proc.kill();
      process.exit(0);
    }
  }
});
proc.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`FAIL: packaged MCP exited ${code} before answering`);
    process.exit(1);
  }
});

proc.stdin.write(
  JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "packaged-check", version: "0" } } }) + "\n",
);
setTimeout(() => {
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
}, 400);
