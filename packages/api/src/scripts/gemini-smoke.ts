/**
 * One-shot Gemini smoke test: a single prose call and a single JSON call
 * through the real seam (rate gate included). Run: pnpm --filter @kittie/api ai:smoke
 */
import { generate, generateJson, isGeminiConfigured, GEMINI_MODEL } from "../lib/gemini.js";

if (!isGeminiConfigured()) {
  console.error("✗ GEMINI_API_KEY missing — add it to .env");
  process.exit(1);
}

const text = await generate('Reply with exactly: KITTIE-OK');
console.log(`✓ prose call (${GEMINI_MODEL}):`, text.trim());

const json = await generateJson<{ ok: boolean }>(
  'Return a JSON object exactly like {"ok": true}',
);
console.log("✓ json call:", JSON.stringify(json));

if (!text.includes("KITTIE-OK") || json.ok !== true) {
  console.error("✗ unexpected output — check model behaviour");
  process.exit(1);
}
console.log("Gemini seam verified.");
