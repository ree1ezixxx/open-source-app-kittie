/**
 * The real image analyzer: a locally-served Gemma vision model via Ollama
 * (lane L7). No API key, no cloud — `gemma4:12b` reports the `vision`
 * capability and runs on `http://localhost:11434`.
 *
 * - Vision: POST /api/chat with the image as base64 in `messages[].images`.
 * - Structured output: a JSON schema in `format` forces parseable JSON, not prose.
 * - Reproducible: `options.temperature = 0` + a fixed `seed`.
 *
 * Failures surface as `AnalyzerError` with a cause so the pipeline can map them
 * to L0 coverage instead of crashing a build. Tests do NOT use this — they
 * inject `FixtureAnalyzer` — so CI needs neither Ollama nor a network.
 */
import { AnalyzerError, type ListingMediaAnalyzer, type ScreenInput } from "./analyzer.js";
import { SCREEN_ROLES, type ScreenReading, type ScreenRole, type UiComponent } from "./types.js";

export interface OllamaAnalyzerOptions {
  /** Ollama base URL. Default `http://localhost:11434`. */
  baseUrl?: string;
  /** Vision-capable model tag. Default `gemma4:12b`. */
  model?: string;
  /** Fixed seed for reproducible output. Default `7`. */
  seed?: number;
  /** Injectable fetch (for wiring/tests). Default global `fetch`. */
  fetchImpl?: typeof fetch;
}

const TASK = [
  "You are a senior mobile-product analyst. You are shown ONE screenshot from",
  "an app-store listing. Identify the screen's role, summarise what it does, list",
  "the UI components you can see (with their visible labels), the product features",
  "the screen advertises or implies, any monetisation signals (subscription, free",
  "trial, in-app purchase, paywall, ads), and the legible text. Respond ONLY with",
  "JSON matching the schema. `confidence` is your 0..1 certainty in the reading.",
].join(" ");

/** JSON schema handed to Ollama's `format` to force a structured reading. */
const SCREEN_SCHEMA = {
  type: "object",
  properties: {
    role: { type: "string", enum: SCREEN_ROLES as unknown as string[] },
    summary: { type: "string" },
    components: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string" },
          label: { type: ["string", "null"] },
        },
        required: ["kind", "label"],
      },
    },
    featureClaims: { type: "array", items: { type: "string" } },
    monetisationSignals: { type: "array", items: { type: "string" } },
    visibleText: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: [
    "role",
    "summary",
    "components",
    "featureClaims",
    "monetisationSignals",
    "visibleText",
    "confidence",
  ],
} as const;

export class OllamaAnalyzer implements ListingMediaAnalyzer {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly seed: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OllamaAnalyzerOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = opts.model ?? "gemma4:12b";
    this.seed = opts.seed ?? 7;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async analyzeScreen(input: ScreenInput): Promise<ScreenReading> {
    const image = await this.toBase64(input);
    const text = input.appTitle ? `App under analysis: ${input.appTitle}.\n${TASK}` : TASK;

    // One attempt + one retry, but ONLY on parse/validation failure. An infra
    // error from callOllama propagates immediately (no point hammering a model
    // that isn't there).
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const content = await this.callOllama(text, image);
      try {
        return validateReading(JSON.parse(content));
      } catch (err) {
        lastErr = err;
      }
    }
    throw new AnalyzerError("parse_failed", `gemma returned unparseable JSON: ${String(lastErr)}`);
  }

  private async toBase64(input: ScreenInput): Promise<string> {
    if (input.imageBase64) return input.imageBase64;
    if (!input.imageUrl) {
      throw new AnalyzerError("fetch_failed", "no imageUrl or imageBase64 provided");
    }
    let res: Response;
    try {
      res = await this.fetchImpl(input.imageUrl);
    } catch (err) {
      throw new AnalyzerError("fetch_failed", `image fetch failed: ${String(err)}`);
    }
    if (!res.ok) {
      throw new AnalyzerError("fetch_failed", `image fetch HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  }

  private async callOllama(text: string, imageBase64: string): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: text, images: [imageBase64] }],
          stream: false,
          format: SCREEN_SCHEMA,
          options: { temperature: 0, seed: this.seed },
        }),
      });
    } catch (err) {
      throw new AnalyzerError("infra_unavailable", `ollama unreachable: ${String(err)}`);
    }
    if (!res.ok) {
      throw new AnalyzerError("infra_unavailable", `ollama HTTP ${res.status}`);
    }
    const body = (await res.json()) as { message?: { content?: string } };
    const content = body.message?.content;
    if (!content) {
      throw new AnalyzerError("parse_failed", "empty ollama response");
    }
    return content;
  }
}

// ---- validation: tolerate model sloppiness, never trust the shape blindly ----

function validateReading(raw: unknown): ScreenReading {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("reading is not an object");
  }
  const r = raw as Record<string, unknown>;
  return {
    role: toRole(r.role),
    summary: typeof r.summary === "string" ? r.summary : "",
    components: toComponents(r.components),
    featureClaims: toStringArray(r.featureClaims),
    monetisationSignals: toStringArray(r.monetisationSignals),
    visibleText: toStringArray(r.visibleText),
    confidence: toConfidence(r.confidence),
  };
}

function toRole(x: unknown): ScreenRole {
  return typeof x === "string" && (SCREEN_ROLES as readonly string[]).includes(x)
    ? (x as ScreenRole)
    : "other";
}

function toStringArray(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];
}

function toComponents(x: unknown): UiComponent[] {
  if (!Array.isArray(x)) return [];
  const out: UiComponent[] = [];
  for (const item of x) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    if (typeof c.kind !== "string") continue;
    out.push({ kind: c.kind, label: typeof c.label === "string" ? c.label : null });
  }
  return out;
}

function toConfidence(x: unknown): number {
  if (typeof x !== "number" || Number.isNaN(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}
