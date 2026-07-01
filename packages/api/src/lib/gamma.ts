/**
 * Local-LLM seam (Lane B) — narrative generation through a locally-installed
 * Gemma model served by Ollama's OpenAI-compatible endpoint. Free + offline, so
 * there is no per-day quota; the failure mode is "Ollama not running / slow",
 * which callers degrade on exactly like a Gemini quota error. JSON-mode only.
 *
 * Cache-through writes to the same `ai_generations` table as the Gemini seam
 * (ADR 0005) so a given input never costs a second generation — but records the
 * REAL model id, never mislabels output as Gemini.
 */
import { createHash } from "node:crypto";
import { getAiGeneration, saveAiGeneration } from "@kittie/db";
import { getDb } from "./db.js";

export const GAMMA_MODEL = process.env.GAMMA_MODEL ?? "gemma4:12b";
const GAMMA_BASE_URL = process.env.GAMMA_BASE_URL ?? "http://localhost:11434/v1";
// gemma4:12b runs ~10 tok/s locally; a full teardown narrative is ~600 tokens,
// so allow generous headroom. Cached after the first call, so latency is paid once.
const DEFAULT_TIMEOUT_MS = Number(process.env.GAMMA_TIMEOUT_MS ?? 150_000);
// Cap output so the model can't ramble past the JSON close (the default cap
// truncates mid-string → unparseable). Big enough for the full blueprint.
const MAX_TOKENS = Number(process.env.GAMMA_MAX_TOKENS ?? 2048);
// Keep the model resident between calls so back-to-back enrichments skip reload.
const KEEP_ALIVE = process.env.GAMMA_KEEP_ALIVE ?? "10m";

/** Thrown when the local model is unreachable / times out / returns junk — the
 *  cue for a caller to degrade to deterministic output (never to fabricate). */
export class GammaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GammaUnavailableError";
  }
}

export interface GammaOptions {
  temperature?: number;
  timeoutMs?: number;
}

/**
 * One JSON generation against the local model. Returns the raw JSON string
 * (validated as parseable). Throws `GammaUnavailableError` on any transport,
 * timeout, or empty/unparseable response.
 */
export async function gammaJsonRaw(prompt: string, opts: GammaOptions = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${GAMMA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: GAMMA_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: opts.temperature ?? 0.4,
        max_tokens: MAX_TOKENS,
        keep_alive: KEEP_ALIVE,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new GammaUnavailableError(`gamma HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new GammaUnavailableError("gamma returned an empty response");
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    JSON.parse(cleaned); // validate before returning/caching — never store junk
    return cleaned;
  } catch (e) {
    if (e instanceof GammaUnavailableError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new GammaUnavailableError(`gamma call failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One JSON generation from a prompt + one inline image (local Gemma is
 * vision-capable). Same JSON-mode + validation + degrade contract as text.
 */
export async function gammaVisionRaw(
  prompt: string,
  image: { base64: string; mime: string },
  opts: GammaOptions = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${GAMMA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: GAMMA_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.base64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: opts.temperature ?? 0.3,
        max_tokens: MAX_TOKENS,
        keep_alive: KEEP_ALIVE,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new GammaUnavailableError(`gamma vision HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new GammaUnavailableError("gamma vision returned an empty response");
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    JSON.parse(cleaned);
    return cleaned;
  } catch (e) {
    if (e instanceof GammaUnavailableError) throw e;
    throw new GammaUnavailableError(`gamma vision failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a listing image and base64-encode it for a vision call. */
export async function fetchImageBase64(url: string, timeoutMs = 15_000): Promise<{ base64: string; mime: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new GammaUnavailableError(`image fetch HTTP ${res.status}`);
    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { base64, mime };
  } catch (e) {
    if (e instanceof GammaUnavailableError) throw e;
    throw new GammaUnavailableError(`image fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

function hashInput(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

/**
 * Cache-through generation: return the stored output for (kind, subjectId,
 * hash(input)) if present, else run `produce` once and store. `produce` must
 * return a validated JSON string. Records the real `GAMMA_MODEL`.
 */
export async function cachedJson<T>(
  kind: string,
  subjectId: string,
  input: string,
  produce: () => Promise<string>,
): Promise<{ value: T; cached: boolean }> {
  const db = getDb();
  const inputHash = hashInput(input);
  const hit = await getAiGeneration(db, kind, subjectId, inputHash);
  if (hit) return { value: JSON.parse(hit.output) as T, cached: true };

  const output = await produce();
  await saveAiGeneration(db, { kind, subjectId, inputHash, output, model: GAMMA_MODEL });
  return { value: JSON.parse(output) as T, cached: false };
}
