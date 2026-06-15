/* ============================================================
   Ollama seam — local-model JSON generation for the App Builder.

   Mirrors the clone-engine's GenerateJson contract: prompt + JSON schema in,
   parsed object out. Uses Ollama structured outputs (`format: <schema>`) so
   the model is constrained server-side; validateBlueprint still clamps the
   result downstream, so a weak local model can never break codegen.

   Config: OLLAMA_URL (default http://localhost:11434)
           OLLAMA_MODEL (default qwen2.5:7b)
   ============================================================ */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

/** Reachability probe, cached briefly so every request doesn't ping Ollama. */
let lastProbe: { at: number; ok: boolean } | null = null;
const PROBE_TTL_MS = 30_000;

export async function isOllamaAvailable(): Promise<boolean> {
  if (lastProbe && Date.now() - lastProbe.at < PROBE_TTL_MS) return lastProbe.ok;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const ok = res.ok;
    lastProbe = { at: Date.now(), ok };
    return ok;
  } catch {
    lastProbe = { at: Date.now(), ok: false };
    return false;
  }
}

/** GenerateJson-shaped call into the local model. Throws on any failure —
    callers (builder engine) already fall back to the heuristic path. */
export async function generateJsonOllama(
  prompt: string,
  schema: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format: schema,
      options: { temperature: 0.7, num_predict: 2048 },
      messages: [
        {
          role: "system",
          content:
            "You are a mobile app product designer. Respond ONLY with JSON matching the required schema.",
        },
        { role: "user", content: prompt },
      ],
    }),
    // local 7B models can take a while on a long schema-constrained generation
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as { message?: { content?: string } };
  const content = json.message?.content;
  if (!content) throw new Error("Ollama returned no content");
  return JSON.parse(content);
}
