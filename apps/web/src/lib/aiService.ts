/**
 * aiService — the single typed contract the AI Studio surfaces consume.
 *
 * These features are NET-NEW: no backend exists yet. Every method below is wired
 * to a deterministic, offline MOCK so the UI is fully clickable today. The two
 * real integrations are flagged in AI_INTEGRATION_POINTS for Rhodri to wire later;
 * swapping `aiService` from `mockAiService` to a real impl is the only change the
 * pages need.
 */
import { queryIdeas, type IdeasPage, type IdeasQuery } from "./api/ideas";

/* ============================================================ Types */

export interface UploadedImage {
  id: string;
  name: string;
  /** base64 data URL for preview + (mock) source frame. */
  dataUrl: string;
}

export interface GeneratedShot {
  id: string;
  /** data URL of the generated App-Store visual (mock = composed SVG). */
  imageUrl: string;
  headline: string;
}

export type JobStatus = "done" | "error";

export interface GenerateScreenshotsInput {
  /** Tracked App id, or null when describing a new / unreleased app. */
  appId: string | null;
  appName: string;
  /** Free-text brief used for the "describe new / unreleased" path. */
  brief?: string;
  sourceImages: UploadedImage[];
  /** Visual direction preset. */
  style?: ScreenshotStyle;
  /** How many optimized frames to produce. */
  count?: number;
}

export type ScreenshotStyle = "bold" | "minimal" | "playful" | "premium";

export interface ScreenshotGeneration {
  id: string;
  appId: string | null;
  appName: string;
  style: ScreenshotStyle;
  createdAt: string; // ISO
  status: JobStatus;
  shots: GeneratedShot[];
}

export interface AiService {
  generateScreenshots(input: GenerateScreenshotsInput): Promise<ScreenshotGeneration>;
  listIdeas(query?: IdeasQuery): Promise<IdeasPage>;
}

/* ============================================================ Integration flags */

export const AI_SERVICE_MODE: "mock" | "live" = "mock";

/** The real integrations Rhodri needs to wire. Surfaced in-UI as honest notices. */
export const AI_INTEGRATION_POINTS = [
  {
    id: "screenshot-generation",
    method: "generateScreenshots",
    title: "App-Store screenshot generation",
    needs:
      "An image-generation model (e.g. Gemini / DALL·E / SDXL) plus a layout engine that composes headline + device frame into store-spec visuals. Mock returns SVG posters.",
  },
  {
    id: "ideas-pipeline",
    method: "listIdeas",
    title: "Hot-ideas generation pipeline",
    needs:
      "A job that mines fast-growing Apps (Snapshots + review clustering) and an LLM that drafts concepts + blueprint tags into an ideas store. Mock returns a static sample set.",
  },
] as const;

let warned = false;
function flagMockOnce(method: string) {
  if (warned || typeof console === "undefined") return;
  warned = true;
  console.info(
    `[aiService] running in MOCK mode (${method}). Real integrations to wire:`,
    AI_INTEGRATION_POINTS.map((p) => p.method),
  );
}

/* ============================================================ Mock impl */

const HEADLINES: Record<ScreenshotStyle, string[]> = {
  bold: ["Built to win", "Your edge, daily", "Move faster", "No more guesswork", "Results that compound"],
  minimal: ["Just the essentials", "Clarity, by default", "Less app, more done", "Quiet by design", "One clean view"],
  playful: ["Make it fun", "Tap into your streak", "Little wins, big days", "You've got this", "Progress feels good"],
  premium: ["Crafted for you", "The pro standard", "Every detail considered", "Worth the upgrade", "Designed to last"],
};

const STYLE_PALETTE: Record<ScreenshotStyle, [string, string, string]> = {
  // [bg-top, bg-bottom, accent]
  bold: ["#0b1f12", "#08120b", "#c6f24d"],
  minimal: ["#14141a", "#0c0c10", "#9aa7ff"],
  playful: ["#231233", "#120a1f", "#ff8fcf"],
  premium: ["#1a1410", "#0d0a08", "#e8c887"],
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Compose a 9:16 App-Store-style poster as an inline SVG data URL (no network). */
function poster(headline: string, style: ScreenshotStyle, source: UploadedImage | undefined, seed: number): string {
  const [top, bottom, accent] = STYLE_PALETTE[style];
  const W = 600;
  const H = 1067;
  // Faux device screen: real upload if present, else an abstract UI mock.
  const screen = source
    ? `<image href="${source.dataUrl}" x="90" y="360" width="420" height="620" preserveAspectRatio="xMidYMid slice" clip-path="url(#round)"/>`
    : `<g clip-path="url(#round)">
         <rect x="90" y="360" width="420" height="620" fill="#0c0c0f"/>
         <rect x="120" y="400" width="360" height="44" rx="10" fill="${accent}" opacity="0.9"/>
         <rect x="120" y="470" width="240" height="20" rx="6" fill="#ffffff" opacity="0.18"/>
         <rect x="120" y="505" width="300" height="20" rx="6" fill="#ffffff" opacity="0.12"/>
         <rect x="120" y="560" width="360" height="120" rx="16" fill="#ffffff" opacity="0.05"/>
         <rect x="120" y="700" width="360" height="120" rx="16" fill="#ffffff" opacity="0.05"/>
         <rect x="120" y="900" width="360" height="48" rx="12" fill="${accent}" opacity="0.85"/>
       </g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg${seed}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/>
      </linearGradient>
      <clipPath id="round"><rect x="90" y="360" width="420" height="620" rx="34"/></clipPath>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg${seed})"/>
    <circle cx="${seed % 2 ? 120 : 480}" cy="180" r="220" fill="${accent}" opacity="0.10"/>
    <text x="${W / 2}" y="170" text-anchor="middle" fill="#ffffff" font-family="-apple-system, Inter, sans-serif" font-size="48" font-weight="800" letter-spacing="-1.5">${esc(headline)}</text>
    <rect x="${W / 2 - 60}" y="210" width="120" height="6" rx="3" fill="${accent}"/>
    <rect x="90" y="350" width="420" height="640" rx="44" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="3"/>
    ${screen}
    <text x="${W / 2}" y="1030" text-anchor="middle" fill="#ffffff" opacity="0.4" font-family="-apple-system, sans-serif" font-size="20" font-weight="600">${esc(style.toUpperCase())} · MOCK PREVIEW</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const mockAiService: AiService = {
  async generateScreenshots(input) {
    flagMockOnce("generateScreenshots");
    await delay(900 + Math.random() * 700); // simulate model latency
    const style = input.style ?? "bold";
    const count = Math.min(Math.max(input.count ?? 4, 1), 6);
    const pool = HEADLINES[style];
    const shots: GeneratedShot[] = Array.from({ length: count }, (_, i) => {
      const headline = pool[i % pool.length] ?? "Built for you";
      const source = input.sourceImages[i % Math.max(input.sourceImages.length, 1)];
      return {
        id: `shot-${Date.now()}-${i}`,
        headline,
        imageUrl: poster(headline, style, source, i + 1),
      };
    });
    return {
      id: `gen-${Date.now()}`,
      appId: input.appId,
      appName: input.appName,
      style,
      createdAt: new Date().toISOString(),
      status: "done",
      shots,
    };
  },

  async listIdeas(query) {
    flagMockOnce("listIdeas");
    await delay(250);
    return queryIdeas(query);
  },
};

/** Active service. Swap to a live impl when the integrations above are wired. */
export const aiService: AiService = mockAiService;
