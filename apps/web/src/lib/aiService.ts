/**
 * aiService — the single typed contract the AI Studio surfaces consume.
 *
 * Hot Ideas is LIVE: read from /api/v1/ideas (batch-generated server-side, ADR 0005).
 *
 * Screenshot generation is REAL on render + export, with a deterministic DESIGN
 * layer (ported engine + brand palette, designed backgrounds, fonts, copy derived
 * from the app name/brief, narrative flow). The one remaining AI gap is model-
 * driven art direction (see AI_INTEGRATION_POINTS).
 */
import { queryIdeas, type IdeasPage, type IdeasQuery } from "./api/ideas";
import {
  type BackgroundStyle,
  type Device,
  type DesignSpec,
  type FlowStrategy,
  type FontId,
  type Slide,
  type SlideLayout,
} from "../components/aistudio/screenshot-engine";

/* ============================================================ Types */

export interface UploadedImage {
  id: string;
  name: string;
  /** base64 data URL — used directly as the source frame inside the device. */
  dataUrl: string;
}

export type JobStatus = "done" | "error";

// Mirrors appkittie's Design Style presets (same names, same order).
export type ScreenshotStyle =
  | "modern"
  | "editorial"
  | "ios-native"
  | "premium"
  | "feature-focused"
  | "minimal"
  | "playful"
  | "professional"
  | "bold"
  | "elegant";

export interface GenerateScreenshotsInput {
  /** Tracked App id, or null when describing a new / unreleased app. */
  appId: string | null;
  appName: string;
  /** App icon as a data URL (uploaded or imported) — shown on each slide. */
  appIcon?: string | null;
  /** App-listing intake — drives the on-screen copy. */
  subtitle?: string;
  developer?: string;
  category?: string;
  description?: string;
  prompt?: string;
  targetAudience?: string;
  appStoreKeywords?: string[];
  /** The literal words to put on the screenshots. */
  brandKeywords?: string[];
  sourceImages: UploadedImage[];
  /** Visual direction preset (sets the design defaults). */
  style?: ScreenshotStyle;
  /** How many optimized frames to produce. */
  count?: number;
  /** Optional design overrides (UI controls) — Primary / Secondary / Accent. */
  accent?: string;
  brand?: string;
  tint?: string;
  background?: BackgroundStyle;
  font?: FontId;
  flow?: FlowStrategy;
}

export interface ScreenshotGeneration {
  id: string;
  appId: string | null;
  appName: string;
  appIcon: string | null;
  style: ScreenshotStyle;
  device: Device;
  /** Theme id used by the engine (resolve with themeById). */
  themeId: string;
  /** Resolved design spec — passed straight to the renderer. */
  design: DesignSpec;
  createdAt: string; // ISO
  status: JobStatus;
  slides: Slide[];
}

export interface AiService {
  generateScreenshots(input: GenerateScreenshotsInput): Promise<ScreenshotGeneration>;
  listIdeas(query?: IdeasQuery): Promise<IdeasPage>;
}

/* ============================================================ Integration flags */

// LIVE: screenshot copy calls /api/v1/ai/art-direction (Gemini) with a
// deterministic fallback; Hot Ideas read the batch-generated /api/v1/ideas.
export const AI_SERVICE_MODE: "mock" | "live" = "live";

export const AI_INTEGRATION_POINTS = [
  {
    id: "screenshot-art-direction",
    method: "generateScreenshots",
    title: "Screenshot art-direction model",
    needs:
      "Render, export, and a deterministic design layer (backgrounds, brand palette, fonts, derived copy, flow) are REAL. A vision/LLM model could still upgrade art direction — reading the live App Store listing to write sharper copy and pick palette/layout per app.",
  },
  {
    id: "ideas-pipeline",
    method: "listIdeas",
    title: "Hot-ideas generation pipeline",
    needs:
      "LIVE — the API's hot-ideas sweep batch-generates concepts + Blueprints with Gemini from fast-growing source Apps and stores them; this client only reads /api/v1/ideas.",
  },
] as const;

let warned = false;
function flagMockOnce(method: string) {
  if (warned || typeof console === "undefined") return;
  warned = true;
  console.info(`[aiService] ${method}: screenshot render+export+design are live; art direction is deterministic.`);
}

/* ============================================================ Design defaults per style */

type StyleDesign = {
  themeId: string;
  accent: string; // Primary
  brand: string; // Secondary
  tint: string; // Accent
  background: BackgroundStyle;
  font: FontId;
  flow: FlowStrategy;
};

const STYLE_DESIGN: Record<ScreenshotStyle, StyleDesign> = {
  modern: { themeId: "clean-light", accent: "#5b7cfa", brand: "#0ea5e9", tint: "#a78bfa", background: "gradient", font: "inter", flow: "default" },
  editorial: { themeId: "warm-editorial", accent: "#d97706", brand: "#b45309", tint: "#f59e0b", background: "minimal", font: "playfair", flow: "default" },
  "ios-native": { themeId: "clean-light", accent: "#0a84ff", brand: "#30d158", tint: "#ff9f0a", background: "minimal", font: "inter", flow: "default" },
  premium: { themeId: "bloom-roast", accent: "#b8794a", brand: "#24352f", tint: "#e8c9a0", background: "glass", font: "playfair", flow: "default" },
  "feature-focused": { themeId: "dark-bold", accent: "#c6f24d", brand: "#8b5cf6", tint: "#22d3ee", background: "spotlight", font: "grotesk", flow: "alternating-split" },
  minimal: { themeId: "clean-light", accent: "#5b7cfa", brand: "#94a3b8", tint: "#0ea5e9", background: "minimal", font: "inter", flow: "default" },
  playful: { themeId: "ocean-fresh", accent: "#0284c7", brand: "#f59e0b", tint: "#ec4899", background: "mesh", font: "poppins", flow: "alternating-split" },
  professional: { themeId: "midnight-pro", accent: "#5b9cff", brand: "#38bdf8", tint: "#818cf8", background: "gradient", font: "dmsans", flow: "default" },
  bold: { themeId: "dark-bold", accent: "#c6f24d", brand: "#8b5cf6", tint: "#f43f5e", background: "mesh", font: "anton", flow: "hero-split" },
  elegant: { themeId: "ivory-elegant", accent: "#9a7b4f", brand: "#2a2622", tint: "#c0a080", background: "layered", font: "playfair", flow: "default" },
};

/** The design controls' starting values for a given style preset. */
export function designDefaults(style: ScreenshotStyle): DesignSpec {
  const d = STYLE_DESIGN[style];
  return { accent: d.accent, brand: d.brand, tint: d.tint, background: d.background, font: d.font, flow: d.flow };
}

/* ============================================================ Derived copy */

const STOP = new Set([
  "the", "and", "for", "with", "your", "you", "that", "this", "from", "into", "app",
  "are", "our", "all", "can", "get", "use", "new", "now", "more", "than", "then",
  "they", "their", "them", "have", "has", "was", "will", "what", "when", "who",
  "a", "an", "of", "to", "in", "on", "is", "it", "or", "by", "as", "at", "be",
]);

const FALLBACK_HEADLINES: Record<ScreenshotStyle, string[]> = {
  modern: ["Designed for now", "Everything in\none place", "Built for speed", "Your day,\nsimplified", "Smart by default", "Made to move"],
  editorial: ["A story worth\ntelling", "Where it all\ncomes together", "Read the room", "Curated for you", "The full picture", "Stories that stick"],
  "ios-native": ["Feels right at home", "Made for iPhone", "Simply native", "Fast, fluid, familiar", "It just works", "Built the Apple way"],
  premium: ["Crafted for you", "The pro standard", "Every detail\nconsidered", "Worth the upgrade", "Designed to last", "Quietly powerful"],
  "feature-focused": ["One tap away", "Everything you need", "See it in action", "Built around you", "Power, made simple", "Do more, faster"],
  minimal: ["Just the essentials", "Clarity, by default", "Less app,\nmore done", "Quiet by design", "One clean view", "Calm, on purpose"],
  playful: ["Make it fun", "Tap into\nyour streak", "Little wins,\nbig days", "You've got this", "Progress feels good", "Keep the chain alive"],
  professional: ["Work, elevated", "Built for teams", "Decisions, faster", "The serious choice", "Trusted at scale", "Precision, by design"],
  bold: ["Built to win", "Your edge, daily", "Move faster", "No more guesswork", "Results that compound", "Own your day"],
  elegant: ["Beautifully simple", "Refined to the detail", "Effortless, by design", "Understated power", "A quieter kind\nof great", "Timeless and clean"],
};

const FALLBACK_LABELS: Record<ScreenshotStyle, string[]> = {
  modern: ["Modern", "Fast", "Smart", "Clean", "Today", "Flow"],
  editorial: ["Story", "Feature", "Curated", "Read", "Insight", "Series"],
  "ios-native": ["Native", "iPhone", "Fluid", "Familiar", "Apple", "Fast"],
  premium: ["Pro", "Crafted", "Detail", "Premium", "Quality", "Upgrade"],
  "feature-focused": ["Feature", "Power", "Simple", "Fast", "Built-in", "Daily"],
  minimal: ["Simple", "Clean", "Focus", "Calm", "Clear", "Essential"],
  playful: ["Streaks", "Wins", "Fun", "Habits", "Progress", "Daily"],
  professional: ["Pro", "Teams", "Trusted", "Scale", "Precise", "Work"],
  bold: ["Performance", "Momentum", "Focus", "Results", "Edge", "Daily"],
  elegant: ["Elegant", "Refined", "Detail", "Quiet", "Timeless", "Crafted"],
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Short app-name kicker (first meaningful word, ≤14 chars). */
function shortName(appName: string): string {
  const first = appName.split(/[\s—:–-]+/).filter(Boolean)[0] ?? appName;
  return first.slice(0, 14);
}

/** Split a free-text brief into short, headline-worthy phrases. */
function briefPhrases(brief?: string): string[] {
  if (!brief) return [];
  const seen = new Set<string>();
  return brief
    .split(/[.;,\n—•]+|\sand\s/i)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => {
      const words = s.split(" ");
      if (words.length < 2 || words.length > 6 || s.length < 6) return false;
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(cap)
    .slice(0, 8);
}

/** Salient keywords from the brief, for kicker labels. */
function briefKeywords(brief?: string): string[] {
  if (!brief) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of brief.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []) {
    if (STOP.has(m) || seen.has(m)) continue;
    seen.add(m);
    out.push(cap(m));
    if (out.length >= 8) break;
  }
  return out;
}

function titlePhrase(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/^[a-z]/, (m) => m.toUpperCase());
}

/**
 * The copy engine. Builds per-slide headline + kicker from the app listing.
 * Headlines (the words ON the screenshots) prefer multi-word brand keywords,
 * then description/prompt phrases, then an audience line, then style fallbacks.
 * Kickers prefer single-word brand keywords, App Store keywords, category, app
 * name, then fallbacks.
 */
function buildCopy(input: GenerateScreenshotsInput, style: ScreenshotStyle, count: number) {
  const brand = (input.brandKeywords ?? []).map((s) => s.trim()).filter(Boolean);
  const aso = (input.appStoreKeywords ?? []).map((s) => s.trim()).filter(Boolean);
  const audience = (input.targetAudience ?? "").trim();

  const brandHeadlines = brand.filter((k) => k.split(/\s+/).length >= 2).map(titlePhrase);
  const audienceLine = audience ? [`Made for ${audience}`] : [];
  const headlines = dedupe([
    ...brandHeadlines,
    ...briefPhrases(input.description),
    ...briefPhrases(input.prompt),
    ...audienceLine,
    ...FALLBACK_HEADLINES[style],
  ]);

  const brandSingles = brand.filter((k) => k.split(/\s+/).length === 1).map(cap);
  const labels = dedupe([
    shortName(input.appName),
    ...brandSingles,
    ...aso.map(cap),
    ...(input.category ? [cap(input.category)] : []),
    ...briefKeywords(input.description),
    ...FALLBACK_LABELS[style],
  ]);

  return Array.from({ length: count }, (_, i) => ({
    headline: headlines[i % headlines.length]!,
    label: labels[i % labels.length]!,
  }));
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ============================================================ Flow → layouts */

function flowLayouts(flow: FlowStrategy, count: number): SlideLayout[] {
  return Array.from({ length: count }, (_, i): SlideLayout => {
    if (i === 0) return flow === "default" ? "hero" : "split";
    if (count >= 5 && i === count - 1 && flow !== "alternating-split") return "no-device";
    if (flow === "alternating-split") return i % 2 === 1 ? "split" : "device-top";
    if (flow === "hero-split") return i % 2 === 1 ? "device-bottom" : "split";
    return i % 2 === 1 ? "device-bottom" : "device-top";
  });
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Real Gemini art direction: the server writes the slide copy (cached by
 * input). Falls back to the deterministic derived-phrase copy on any failure
 * (no key, daily quota, network) — generation must never block on the model.
 */
async function fetchArtDirection(
  input: GenerateScreenshotsInput,
  style: ScreenshotStyle,
  count: number,
): Promise<Array<{ headline: string; label: string }> | null> {
  try {
    const res = await fetch("/api/v1/ai/art-direction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId: input.appId,
        appName: input.appName,
        category: input.category,
        description: input.description,
        prompt: input.prompt,
        targetAudience: input.targetAudience,
        brandKeywords: input.brandKeywords ?? [],
        appStoreKeywords: input.appStoreKeywords ?? [],
        style,
        count,
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: { slides: Array<{ headline: string; label: string }> } };
    const slides = body.data.slides.filter((s) => s.headline && s.label);
    return slides.length === count ? slides : null;
  } catch {
    return null;
  }
}

/* ============================================================ Service */

export const mockAiService: AiService = {
  async generateScreenshots(input) {
    flagMockOnce("generateScreenshots");

    const style = input.style ?? "modern";
    const count = Math.min(Math.max(input.count ?? 6, 1), 10);
    const device: Device = "iphone";
    const d = STYLE_DESIGN[style];

    const design: DesignSpec = {
      background: input.background ?? d.background,
      font: input.font ?? d.font,
      flow: input.flow ?? d.flow,
      accent: input.accent ?? d.accent,
      brand: input.brand ?? d.brand,
      tint: input.tint ?? d.tint,
    };

    const layouts = flowLayouts(design.flow, count);
    const copy = (await fetchArtDirection(input, style, count)) ?? buildCopy(input, style, count);
    const sources = input.sourceImages;
    const stamp = Date.now();

    // Cohesive deck: one palette across all slides (no random inversion). Each
    // uploaded image is used at most once; when there are more device slots than
    // images, the surplus become standalone feature slides instead of repeating
    // the same screenshot.
    let assigned = 0;
    const slides: Slide[] = layouts.map((layout, i) => {
      let lay = layout;
      let screenshot = "";
      if (lay !== "no-device") {
        if (assigned < sources.length) {
          screenshot = sources[assigned]!.dataUrl;
          assigned++;
        } else {
          lay = "no-device";
        }
      }
      return {
        id: `slide-${stamp}-${i}`,
        layout: lay,
        label: copy[i]!.label,
        headline: copy[i]!.headline,
        screenshot,
        inverted: false,
      };
    });

    return {
      id: `gen-${stamp}`,
      appId: input.appId,
      appName: input.appName,
      appIcon: input.appIcon ?? null,
      style,
      device,
      themeId: d.themeId,
      design,
      createdAt: new Date().toISOString(),
      status: "done",
      slides,
    };
  },

  async listIdeas(query) {
    // LIVE: /api/v1/ideas — batch-generated server-side (ADR 0005).
    return queryIdeas(query);
  },
};

/** Active service. Swap to a live impl when the integrations above are wired. */
export const aiService: AiService = mockAiService;
