/* ============================================================
   Additive lane — the LLM seam (PRD-additive-edge D1).

   The ONE place the app touches a language model. Every AI surface
   (research chat, Idea→PRD enrichment, …) consumes these two exports;
   nothing else may instantiate an LLM client.

   Contract:
   • GEMINI_API_KEY present  → Gemini via @google/genai, model
     "gemini-2.5-flash".
   • GEMINI_API_KEY absent   → seamStatus().enabled === false and
     generateText() resolves null. Surfaces render an honest disabled
     state — never a faked response.
   • A missing/invalid key, quota error, or network failure must never
     crash the API: generateText catches everything → null.
   ============================================================ */
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash";

function apiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : null;
}

export function seamStatus(): { enabled: boolean; model: string | null } {
  const enabled = apiKey() !== null;
  return { enabled, model: enabled ? MODEL : null };
}

/** Lazy-init client so a boot without the key costs nothing. Re-created if
    the key changes between calls (e.g. .env edited + process restarted is
    the normal path, but cheap to guard anyway). */
let client: GoogleGenAI | null = null;
let clientKey: string | null = null;

function getClient(key: string): GoogleGenAI {
  if (!client || clientKey !== key) {
    client = new GoogleGenAI({ apiKey: key });
    clientKey = key;
  }
  return client;
}

export async function generateText(
  prompt: string,
  opts: { maxOutputTokens?: number } = {},
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;

  try {
    const response = await getClient(key).models.generateContent({
      model: MODEL,
      contents: prompt,
      ...(opts.maxOutputTokens !== undefined
        ? { config: { maxOutputTokens: opts.maxOutputTokens } }
        : {}),
    });
    const text = response.text;
    return typeof text === "string" && text.trim().length > 0 ? text : null;
  } catch {
    // Invalid key, quota, network, safety block — all collapse to null so
    // callers fall back to their non-LLM path instead of 500ing.
    return null;
  }
}
