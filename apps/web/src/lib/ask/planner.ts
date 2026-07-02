/**
 * Deterministic Ask planner (#192). Parses a plain-language question into ONE
 * of the four grounded intelligence intents + params — NO LLM, no free-form
 * generation. Unparseable questions resolve to `unsupported` so the UI can fail
 * honestly and list what CAN be asked.
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

/** Human-readable summary of what the planner can answer — shown on the honest
 *  "can't answer that yet" state. */
export const SUPPORTED_ACTIONS: string[] = [
  "App detail — an app id like `apple:6446901002` (or “tell me about <id>”).",
  "Trending — “what's trending in <category> in <country>” (optionally a 7d/30d/… window).",
  "Compare — “compare <id> and <id>” (two or more apps).",
  "Validate — “validate <your app idea>” / “is there room for <idea>”.",
];

const APP_ID_RE = /\b(?:apple|google):[A-Za-z0-9._-]+/gi;
const TREND_PERIOD_RE = /\b(7|14|30|60|90)\s*d(?:ays)?\b/i;
const ISO_COUNTRY_RE = /\bin\s+(?:the\s+)?([A-Z]{2})\b/;

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
  const m = text.match(ISO_COUNTRY_RE);
  return m ? (m[1] as string).toUpperCase() : "US";
}

function extractCategory(text: string): string | null {
  // "trending in <Category>" — capture the word(s) after "in", stopping at a
  // country/time clause. Kept conservative: single capitalised-ish token/phrase.
  const m = text.match(/\b(?:in|for)\s+([A-Za-z][A-Za-z &-]{1,40}?)(?:\s+(?:in|this|over|during|last|for)\b|[?.!]|$)/i);
  if (!m) return null;
  const raw = (m[1] ?? "").trim();
  // Drop a bare country code captured as category.
  if (/^[A-Z]{2}$/.test(raw)) return null;
  return raw.length > 0 ? raw : null;
}

/** Strip leading trigger phrases so the remaining text is the app idea. */
function extractIdea(text: string): string {
  return text
    .replace(/^\s*(please\s+)?(validate|check|assess|evaluate)\s+(the\s+)?(idea\s*[:-]?\s*)?/i, "")
    .replace(/^\s*(is there|do you think there'?s?)\s+(a\s+)?(room|market|space|demand)\s+for\s+/i, "")
    .replace(/^\s*should i build\s+(an?\s+)?/i, "")
    .trim();
}

export function planQuery(input: string): AskPlan {
  const text = input.trim();
  if (text.length === 0) return { intent: "unsupported", reason: "Enter a question to get started." };

  const ids = extractAppIds(text);
  const wantsCompare = /\bcompare\b/i.test(text) || /\bvs\.?\b/i.test(text) || /\bversus\b/i.test(text);
  const wantsValidate = /\bvalidate\b/i.test(text) || /should i build\b/i.test(text) || /\b(room|market|space|demand)\s+for\b/i.test(text) || /\bapp idea\b/i.test(text);
  const wantsTrends = /\b(trending|rising|top apps|movers?|pulse|fastest[- ]growing|what'?s hot)\b/i.test(text);

  // Compare wins when explicitly requested (or two+ ids present).
  if (wantsCompare || ids.length >= 2) {
    if (ids.length >= 2) return { intent: "compare", apps: ids };
    // "compare X and Y" by name.
    const parts = text
      .replace(/^\s*compare\s+/i, "")
      .split(/\s+(?:vs\.?|versus|and|,)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) return { intent: "compare", apps: parts.slice(0, 5) };
    return { intent: "unsupported", reason: "Compare needs two or more apps — e.g. “compare apple:123 and apple:456”." };
  }

  // A lone app id → app detail.
  if (ids.length === 1 && !wantsValidate && !wantsTrends) {
    return { intent: "app_detail", appId: ids[0] as string };
  }

  if (wantsValidate) {
    const idea = extractIdea(text);
    if (idea.length === 0) return { intent: "unsupported", reason: "Validate needs an idea — e.g. “validate a focus timer for students”." };
    return { intent: "validate", idea };
  }

  if (wantsTrends) {
    return { intent: "trends", category: extractCategory(text), country: extractCountry(text), period: extractPeriod(text) };
  }

  return {
    intent: "unsupported",
    reason: "I can't answer that yet — I only run grounded intelligence queries.",
  };
}
