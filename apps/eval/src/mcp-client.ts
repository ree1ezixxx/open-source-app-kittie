/**
 * Drives the REAL Kittie MCP (apps/mcp) over stdio — exactly as a coding agent would —
 * pointed at the API on KITTIE_API_URL. We never modify the MCP or API; we only call them.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { PlannedCall, ToolCallRecord } from "./types.js";
import { freshnessDays, isEmptyResult } from "./metrics.js";

export interface HarnessOptions {
  apiUrl: string;
  /** Absolute path to apps/mcp/src/index.ts. */
  mcpEntry: string;
  /** Repo root — cwd for the spawned MCP so workspace deps resolve. */
  repoRoot: string;
}

export interface CallOutcome {
  record: ToolCallRecord;
  /** Parsed result data, for threading discovered ids/keywords between prompts. */
  data: unknown;
}

export class McpHarness {
  private client?: Client;
  private transport?: StdioClientTransport;
  private seen = new Set<string>();
  toolNames: string[] = [];

  constructor(private readonly opts: HarnessOptions) {}

  async connect(): Promise<void> {
    // Resolve tsx from the MCP package context (it deps tsx) and run the MCP source under it.
    // node → tsx/cli → apps/mcp/src/index.ts keeps stdout a clean JSON-RPC stream (no pnpm banner).
    const require = createRequire(path.join(this.opts.repoRoot, "apps/mcp/package.json"));
    const tsxPkgJson = require.resolve("tsx/package.json");
    const tsxBin = path.join(path.dirname(tsxPkgJson), "dist/cli.mjs");

    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [tsxBin, this.opts.mcpEntry],
      cwd: this.opts.repoRoot,
      env: { ...process.env, KITTIE_API_URL: this.opts.apiUrl } as Record<string, string>,
    });
    this.client = new Client({ name: "kittie-eval", version: "0.1.0" }, { capabilities: {} });
    await this.client.connect(this.transport);
    const listed = await this.client.listTools();
    this.toolNames = listed.tools.map((t) => t.name);
  }

  /** Reset per-build redundancy tracking (one build = one app being built). */
  newBuild(): void {
    this.seen.clear();
  }

  async call(plan: PlannedCall): Promise<CallOutcome> {
    if (!this.client) throw new Error("harness not connected");

    const sig = `${plan.tool}:${stableArgs(plan.args)}`;
    const redundant = this.seen.has(sig);
    this.seen.add(sig);

    const start = performance.now();
    let ok = false;
    let isError = false;
    let text = "";
    let error: string | undefined;
    try {
      const res = (await this.client.callTool({ name: plan.tool, arguments: plan.args })) as {
        isError?: boolean;
        content?: Array<{ type?: string; text?: string }>;
      };
      isError = res.isError === true;
      ok = !isError;
      text = (res.content ?? [])
        .map((c) => (typeof c.text === "string" ? c.text : ""))
        .join("");
    } catch (e) {
      ok = false;
      isError = true;
      error = e instanceof Error ? e.message : String(e);
      text = error;
    }
    const latencyMs = Math.round(performance.now() - start);
    const parsed = ok ? safeParse(text) : undefined;
    const empty = !ok || isEmptyResult(plan.tool, parsed);
    const payloadChars = text.length;

    const record: ToolCallRecord = {
      ...plan,
      ok,
      isError,
      latencyMs,
      payloadChars,
      tokensEst: Math.ceil(payloadChars / 4),
      empty,
      relevant: ok && !empty,
      falseActivation: !ok || empty,
      redundant,
      freshnessDays: ok ? freshnessDays(parsed, Date.now()) : null,
      ...(error ? { error } : {}),
    };
    return { record, data: parsed };
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } catch {
      /* ignore */
    }
    try {
      await this.transport?.close();
    } catch {
      /* ignore */
    }
  }
}

function stableArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args).sort();
  const norm: Record<string, unknown> = {};
  for (const k of keys) norm[k] = args[k];
  return JSON.stringify(norm);
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text; // a plain-text body (e.g. an MCP error string) is still inspectable.
  }
}
