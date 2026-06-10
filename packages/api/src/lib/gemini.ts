import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { loadEnv } from "@kittie/core";
import { getAiGeneration, saveAiGeneration } from "@kittie/db";

import { getDb } from "./db.js";

/* ============================================================
   Gemini seam — the ONE place AI calls go through.

   Architecture (ADR 0005): batch-generate → store in DB → refresh on
   cadence. Per-view generation is never allowed; the two user-triggered
   kinds (App About, art direction / translation) go through cached()
   so the same input never costs a second call.

   The free tier is ~15 requests/minute. Rather than trusting every call
   site to pace itself, ALL calls funnel through a single serialized
   queue with a minimum gap — sweeps add their own (longer) pacing on
   top, so user-triggered calls usually find the queue empty.
   ============================================================ */

export const GEMINI_MODEL = "gemini-2.5-flash";
/** Batch sweeps use flash-lite: a separate (much larger) free per-day quota
    bucket, so bulk generation never starves user-facing calls. */
export const GEMINI_BATCH_MODEL = "gemini-2.5-flash-lite";

/** Thrown when the per-day free quota is gone — retrying is pointless until tomorrow. */
export class GeminiDailyQuotaError extends Error {
  constructor(model: string) {
    super(`Gemini daily free quota exhausted for ${model}`);
    this.name = "GeminiDailyQuotaError";
  }
}

/** Floor between calls (free-tier flash is ~10 rpm ⇒ ≥6s). */
const MIN_GAP_MS = 6_500;
const MAX_RETRIES = 3;

let client: GoogleGenAI | null = null;

export function isGeminiConfigured(): boolean {
  return Boolean(loadEnv().GEMINI_API_KEY);
}

function getClient(): GoogleGenAI {
  const key = loadEnv().GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set — add it to .env (see .env.example)");
  }
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
}

/* ---- global serialized rate gate -------------------------------------- */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Two-tier rate gate. "user" calls (lazy About, translation, art direction)
 * jump ahead of "batch" calls (the hot-ideas sweep), so a person opening a
 * page never waits behind a 75-call generation slice. Still strictly
 * serialized with MIN_GAP_MS between calls — one global budget.
 */
interface QueueItem {
  work: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

const userQueue: QueueItem[] = [];
const batchQueue: QueueItem[] = [];
let lastCallAt = 0;
let pumping = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const item = userQueue.shift() ?? batchQueue.shift();
      if (!item) break;
      const wait = lastCallAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        item.resolve(await item.work());
      } catch (e) {
        item.reject(e);
      } finally {
        lastCallAt = Date.now();
      }
    }
  } finally {
    pumping = false;
  }
}

export type GeminiPriority = "user" | "batch";

function enqueue<T>(work: () => Promise<T>, priority: GeminiPriority): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const queue = priority === "user" ? userQueue : batchQueue;
    queue.push({ work, resolve: resolve as (v: unknown) => void, reject });
    void pump();
  });
}

/* ---- calls ------------------------------------------------------------- */

export interface GenerateOptions {
  /** Ask the model for a JSON document instead of prose. */
  json?: boolean;
  /** Optional JSON schema the response must conform to (implies json). */
  responseSchema?: Record<string, unknown>;
  /** "user" jumps the queue (default); sweeps must pass "batch". */
  priority?: GeminiPriority;
  /** Model override — sweeps pass GEMINI_BATCH_MODEL. */
  model?: string;
}

async function callOnce(prompt: string, opts: GenerateOptions): Promise<string> {
  const res = await getClient().models.generateContent({
    model: opts.model ?? GEMINI_MODEL,
    contents: prompt,
    ...(opts.json || opts.responseSchema
      ? {
          config: {
            responseMimeType: "application/json",
            ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
          },
        }
      : {}),
  });
  const text = res.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

/**
 * One generation call. Serialized + paced + retried on 429/5xx. Retry sleeps
 * happen OUTSIDE the gate so a rate-limited batch call never blocks the queue
 * — each attempt re-enqueues and user-priority calls slip in between.
 */
export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const priority = opts.priority ?? "user";
  let attempt = 0;
  for (;;) {
    try {
      return await enqueue(() => callOnce(prompt, opts), priority);
    } catch (e) {
      attempt++;
      const msg = e instanceof Error ? e.message : String(e);
      // A per-DAY quota violation cannot be retried away — fail fast so user
      // requests degrade instantly and sweeps stop burning the queue.
      if (/PerDay/i.test(msg)) throw new GeminiDailyQuotaError(opts.model ?? GEMINI_MODEL);
      const retryable = /429|RESOURCE_EXHAUSTED|500|503|UNAVAILABLE/i.test(msg);
      if (!retryable || attempt > MAX_RETRIES) throw e;
      await sleep(attempt * 15_000); // per-minute 429s do recover after a pause
    }
  }
}

/**
 * Multimodal (vision) call through the same gate: instruction + one inline
 * image. Used by screenshot translation. JSON-mode response.
 */
export async function generateVisionRaw(
  instruction: string,
  image: { mimeType: string; base64: string },
  model?: string,
): Promise<string> {
  const useModel = model ?? GEMINI_MODEL;
  let attempt = 0;
  for (;;) {
    try {
      return await enqueue(async () => {
        const res = await getClient().models.generateContent({
          model: useModel,
          contents: [
            { inlineData: { mimeType: image.mimeType, data: image.base64 } },
            { text: instruction },
          ],
          config: { responseMimeType: "application/json" },
        });
        const text = res.text;
        if (!text) throw new Error("Gemini returned an empty response");
        return text;
      }, "user");
    } catch (e) {
      attempt++;
      const msg = e instanceof Error ? e.message : String(e);
      if (/PerDay/i.test(msg)) throw new GeminiDailyQuotaError(useModel);
      const retryable = /429|RESOURCE_EXHAUSTED|500|503|UNAVAILABLE/i.test(msg);
      if (!retryable || attempt > MAX_RETRIES) throw e;
      await sleep(attempt * 15_000);
    }
  }
}

/** generate() + JSON.parse, tolerating accidental markdown fences. */
export async function generateJson<T>(prompt: string, opts: GenerateOptions = {}): Promise<T> {
  const raw = await generate(prompt, { ...opts, json: true });
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(text) as T;
}

/* ---- cache-through ------------------------------------------------------ */

export function hashInput(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

/**
 * Cache-through generation: return the stored output for (kind, subjectId,
 * hash(input)) if it exists, otherwise generate once and store. This is the
 * required path for every user-triggered kind.
 */
export async function cachedGenerate(
  kind: string,
  subjectId: string,
  input: string,
  produce: () => Promise<string>,
): Promise<{ output: string; cached: boolean }> {
  const db = getDb();
  const inputHash = hashInput(input);
  const hit = await getAiGeneration(db, kind, subjectId, inputHash);
  if (hit) return { output: hit.output, cached: true };

  const output = await produce();
  await saveAiGeneration(db, { kind, subjectId, inputHash, output, model: GEMINI_MODEL });
  return { output, cached: false };
}
