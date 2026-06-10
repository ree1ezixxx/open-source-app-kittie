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

export type ScreenshotStyle = "bold" | "minimal" | "playful" | "premium";

export interface GenerateScreenshotsInput {
  /** Tracked App id, or null when describing a new / unreleased app. */
  appId: string | null;
  appName: string;
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
  /** Optional design overrides (UI controls). */
  accent?: string;
  brand?: string;
  background?: BackgroundStyle;
  font?: FontId;
  flow?: FlowStrategy;
}

export interface ScreenshotGeneration {
  id: string;
  appId: string | null;
  appName: string;
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

export const AI_SERVICE_MODE: "mock" | "live" = "mock";

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
  accent: string;
  brand: string;
  background: BackgroundStyle;
  font: FontId;
  flow: FlowStrategy;
};

const STYLE_DESIGN: Record<ScreenshotStyle, StyleDesign> = {
  bold: { themeId: "dark-bold", accent: "#c6f24d", brand: "#8b5cf6", background: "mesh", font: "anton", flow: "hero-split" },
  minimal: { themeId: "clean-light", accent: "#5b7cfa", brand: "#0ea5e9", background: "gradient", font: "inter", flow: "default" },
  playful: { themeId: "ocean-fresh", accent: "#0284c7", brand: "#f59e0b", background: "mesh", font: "poppins", flow: "alternating-split" },
  premium: { themeId: "bloom-roast", accent: "#b8794a", brand: "#24352f", background: "duotone", font: "playfair", flow: "default" },
};

/** The design controls' starting values for a given style preset. */
export function designDefaults(style: ScreenshotStyle): DesignSpec {
  const d = STYLE_DESIGN[style];
  return { accent: d.accent, brand: d.brand, background: d.background, font: d.font, flow: d.flow };
}

/* ============================================================ Derived copy */

const STOP = new Set([
  "the", "and", "for", "with", "your", "you", "that", "this", "from", "into", "app",
  "are", "our", "all", "can", "get", "use", "new", "now", "more", "than", "then",
  "they", "their", "them", "have", "has", "was", "will", "what", "when", "who",
  "a", "an", "of", "to", "in", "on", "is", "it", "or", "by", "as", "at", "be",
]);

const FALLBACK_HEADLINES: Record<ScreenshotStyle, string[]> = {
  bold: ["Built to win", "Your edge, daily", "Move faster", "No more guesswork", "Results that compound", "Own your day"],
  minimal: ["Just the essentials", "Clarity, by default", "Less app,\nmore done", "Quiet by design", "One clean view", "Calm, on purpose"],
  playful: ["Make it fun", "Tap into\nyour streak", "Little wins,\nbig days", "You've got this", "Progress feels good", "Keep the chain alive"],
  premium: ["Crafted for you", "The pro standard", "Every detail\nconsidered", "Worth the upgrade", "Designed to last", "Quietly powerful"],
};

const FALLBACK_LABELS: Record<ScreenshotStyle, string[]> = {
  bold: ["Performance", "Momentum", "Focus", "Results", "Edge", "Daily"],
  minimal: ["Simple", "Clean", "Focus", "Calm", "Clear", "Essential"],
  playful: ["Streaks", "Wins", "Fun", "Habits", "Progress", "Daily"],
  premium: ["Pro", "Crafted", "Detail", "Premium", "Quality", "Upgrade"],
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

    const style = input.style ?? "bold";
    const count = Math.min(Math.max(input.count ?? 4, 1), 8);
    const device: Device = "iphone";
    const d = STYLE_DESIGN[style];

    const design: DesignSpec = {
      background: input.background ?? d.background,
      font: input.font ?? d.font,
      flow: input.flow ?? d.flow,
      accent: input.accent ?? d.accent,
      brand: input.brand ?? d.brand,
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
