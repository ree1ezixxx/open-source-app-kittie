/**
 * Deterministic Ask planner (#192). Parses a plain-language question into ONE
 * of the four grounded intelligence intents + params — NO LLM, no free-form
 * generation. Unparseable questions resolve to `unsupported` so the UI can fail
 * honestly and list what CAN be asked.
 *
 * Disambiguation order matters: explicit validate/app-detail intents are
 * resolved BEFORE the "compare" substring fallback, and compare-by-name only
 * fires when the query actually starts with "compare" and yields ≥2 clean
 * targets — so a prose query like "validate a tool to compare prices" routes to
 * validate, not a junk comparison.
 */
export type AskIntent = "app_detail" | "trends" | "compare" | "validate";

export interface AppDetailPlan {
  intent: "app_detail";
  appId: string;
}
export interface TrendsPlan {
  intent: "trends";
  category: string | null;
  country: string;
  period: string;
}
export interface ComparePlan {
  intent: "compare";
  apps: string[];
}
export interface ValidatePlan {
  intent: "validate";
  idea: string;
}
export interface UnsupportedPlan {
  intent: "unsupported";
  reason: string;
}
export type AskPlan = AppDetailPlan | TrendsPlan | ComparePlan | ValidatePlan | UnsupportedPlan;

export interface ExamplePrompt {
  label: string;
  query: string;
}

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  { label: "App teardown", query: "Tell me about apple:6446901002" },
  { label: "Trending", query: "What's trending in Productivity in the US this week?" },
  { label: "Compare", query: "Compare apple:6446901002 and apple:1122334455" },
  { label: "Validate an idea", query: "Validate a focus timer for exam-week students" },
];

export const SUPPORTED_ACTIONS: string[] = [
  "App detail — an app id like `apple:6446901002` (or “tell me about <id>”).",
  "Trending — “what's trending in <category> in <country>” (optionally a 7d/30d/… window).",
  "Compare — “compare <id> and <id>” (two or more apps).",
  "Validate — “validate <your app idea>” / “is there room for <idea>”.",
];

const APP_ID_RE = /\b(?:apple|google):[A-Za-z0-9._-]+/gi;
const TREND_PERIOD_RE = /\b(7|14|30|60|90)\s*d(?:ays)?\b/i;

/** Common country names/demonyms → ISO, so they're read as markets, not categories. */
const COUNTRY_TO_ISO: Record<string, string> = {
  "united states": "US", usa: "US", us: "US", america: "US",
  "united kingdom": "GB", uk: "GB", britain: "GB", england: "GB",
  netherlands: "NL", holland: "NL", germany: "DE", france: "FR", spain: "ES",
  italy: "IT", japan: "JP", canada: "CA", australia: "AU", brazil: "BR",
  india: "IN", mexico: "MX", "south korea": "KR", korea: "KR",
};

function extractAppIds(text: string): string[] {
  return (text.match(APP_ID_RE) ?? []).map((m) => m.toLowerCase());
}

function extractPeriod(text: string): string {
  const m = text.match(TREND_PERIOD_RE);
  if (m) return `${m[1]}d`;
  if (/\bthis week\b|\bweekly\b/i.test(text)) return "7d";
  if (/\bthis month\b|\bmonthly\b/i.test(text)) return "30d";
  return "7d";
}

function extractCountry(text: string): string {
  // Country name (longest match wins), so "the Netherlands" → NL.
  const lower = text.toLowerCase();
  const hit = Object.keys(COUNTRY_TO_ISO)
    .sort((a, b) => b.length - a.length)
    .find((name) => new RegExp(`\\b${name}\\b`, "i").test(lower));
  if (hit) return COUNTRY_TO_ISO[hit] as string;
  // Otherwise a bare 2-letter ISO code after "in": "in the GB".
  const iso = text.match(/\bin\s+(?:the\s+)?([A-Za-z]{2})\b/);
  if (iso) return (iso[1] as string).toUpperCase();
  return "US";
}

function extractCategory(text: string): string | null {
  const m = text.match(/\b(?:in|for)\s+(?:the\s+)?([A-Za-z][A-Za-z &-]{1,40}?)(?:\s+(?:in|this|over|during|last|for)\b|[?.!]|$)/i);
  if (!m) return null;
  const raw = (m[1] ?? "").trim();
  const lower = raw.toLowerCase();
  // Not a category if it's a country name or a bare 2-letter code.
  if (COUNTRY_TO_ISO[lower] || /^[a-z]{2}$/.test(lower)) return null;
  return raw.length > 0 ? raw : null;
}

/** Pull the idea out of validate phrasing, anchored OR mid-sentence. */
function extractIdea(text: string): string {
  const patterns = [
    /\bapp idea\s+(?:for|of|:)\s+(.+)$/i,
    /\bidea\s+(?:for|of|:)\s+(.+)$/i,
    /\b(?:room|space|market|demand)\s+for\s+(.+)$/i,
    /\bshould i build\s+(.+)$/i,
    /\bvalidate\s+(?:the\s+)?(?:idea\s*(?:for|of|:)?\s*)?(.+)$/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const captured = m?.[1]?.trim().replace(/[?.!]+$/, "").trim();
    if (captured) return captured;
  }
  return "";
}

/** A clean compare target: a short app name, not surrounding prose. */
function isCleanTarget(s: string): boolean {
  if (s.length === 0 || s.length > 40) return false;
  if (/\b(tell|what|how|why|about|please|show|find|which)\b/i.test(s)) return false;
  return true;
}

export function planQuery(input: string): AskPlan {
  const text = input.trim();
  if (text.length === 0) return { intent: "unsupported", reason: "Enter a question to get started." };

  const ids = extractAppIds(text);
  const wantsValidate =
    /\bvalidate\b/i.test(text) ||
    /should i build\b/i.test(text) ||
    /\b(room|market|space|demand)\s+for\b/i.test(text) ||
    /\bapp idea\b/i.test(text);
  const wantsTrends = /\b(trending|rising|top apps|movers?|pulse|fastest[- ]growing|what'?s hot)\b/i.test(text);

  // 1. Two+ app ids → an unambiguous comparison.
  if (ids.length >= 2) return { intent: "compare", apps: ids };

  // 2. Explicit validate intent (resolved before the compare substring fallback).
  if (wantsValidate) {
    const idea = extractIdea(text);
    if (idea.length === 0) {
      return { intent: "unsupported", reason: "Validate needs an idea — e.g. “validate a focus timer for students”." };
    }
    return { intent: "validate", idea };
  }

  // 3. Explicit "compare …" — parse ≥2 clean targets, else honest unsupported.
  //    (Checked before the lone-id fallback so "compare apple:1" isn't misread
  //    as an app-detail lookup.) Only splits when the query starts with
  //    "compare", so surrounding prose ("… versus …") isn't torn into targets.
  if (/^\s*compare\s+/i.test(text)) {
    const targets = text
      .replace(/^\s*compare\s+/i, "")
      .split(/\s+(?:vs\.?|versus|and|,)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    const clean = targets.filter(isCleanTarget);
    if (clean.length >= 2) return { intent: "compare", apps: clean.slice(0, 5) };
    return { intent: "unsupported", reason: "Compare needs two or more apps — e.g. “compare apple:123 and apple:456”." };
  }

  // 4. A lone app id → app detail.
  if (ids.length === 1) return { intent: "app_detail", appId: ids[0] as string };

  // 5. Trending.
  if (wantsTrends) {
    return { intent: "trends", category: extractCategory(text), country: extractCountry(text), period: extractPeriod(text) };
  }

  return { intent: "unsupported", reason: "I can't answer that yet — I only run grounded intelligence queries." };
}
