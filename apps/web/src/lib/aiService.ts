/**
 * aiService — the single typed contract the AI Studio surfaces consume.
 *
 * Hot Ideas remains a deterministic offline MOCK (flagged in AI_INTEGRATION_POINTS).
 *
 * Screenshot generation is now REAL on the render+export side: it produces
 * framed, store-spec slides rendered by the screenshot-engine (ported from
 * ParthJadhav/app-store-screenshots, MIT) and exported as exact App Store PNGs.
 * The remaining AI gap is the *art direction* (auto-choosing layout/copy/theme),
 * which today uses a deterministic style→theme mapping rather than a model.
 */
import { queryIdeas, type IdeasPage, type IdeasQuery } from "./api/ideas";
import {
  themeById,
  type Device,
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
  /** Target device the slides are sized for. */
  device: Device;
  /** Theme id used by the engine (resolve with themeById). */
  themeId: string;
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

/** The real integrations Rhodri may still wire. Surfaced in-UI as honest notices. */
export const AI_INTEGRATION_POINTS = [
  {
    id: "screenshot-art-direction",
    method: "generateScreenshots",
    title: "Screenshot art-direction model",
    needs:
      "Rendering + store-spec PNG export are REAL (screenshot-engine). What's still deterministic is the art direction — an LLM/vision model could pick layout, headline copy, theme and per-slide screenshot ordering from the app's listing instead of the current style→theme mapping.",
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
  console.info(`[aiService] ${method}: ideas are MOCK; screenshot render+export are live.`);
}

/* ============================================================ Art direction (deterministic) */

const HEADLINES: Record<ScreenshotStyle, string[]> = {
  bold: ["Built to win", "Your edge, daily", "Move faster", "No more guesswork", "Results that compound", "Own your day"],
  minimal: ["Just the essentials", "Clarity, by default", "Less app,\nmore done", "Quiet by design", "One clean view", "Calm, on purpose"],
  playful: ["Make it fun", "Tap into\nyour streak", "Little wins,\nbig days", "You've got this", "Progress feels good", "Keep the chain alive"],
  premium: ["Crafted for you", "The pro standard", "Every detail\nconsidered", "Worth the upgrade", "Designed to last", "Quietly powerful"],
};

const LABELS: Record<ScreenshotStyle, string[]> = {
  bold: ["Performance", "Momentum", "Focus", "Results", "Edge", "Daily"],
  minimal: ["Simple", "Clean", "Focus", "Calm", "Clear", "Essential"],
  playful: ["Streaks", "Wins", "Fun", "Habits", "Progress", "Daily"],
  premium: ["Pro", "Crafted", "Detail", "Premium", "Quality", "Upgrade"],
};

const STYLE_THEME: Record<ScreenshotStyle, string> = {
  bold: "dark-bold",
  minimal: "clean-light",
  playful: "ocean-fresh",
  premium: "bloom-roast",
};

// Auto-rotate layouts for visual rhythm: lead with a hero, alternate device
// anchoring, and drop in a standalone-headline beat on longer decks.
function pickLayout(i: number, count: number): SlideLayout {
  if (i === 0) return "hero";
  if (count >= 5 && i === count - 1) return "no-device";
  return i % 2 === 1 ? "device-bottom" : "device-top";
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ============================================================ Service */

export const mockAiService: AiService = {
  async generateScreenshots(input) {
    flagMockOnce("generateScreenshots");
    // Brief artificial pause so the generating state is visible; the work
    // itself (slide spec assembly) is synchronous and real.
    await delay(700);

    const style = input.style ?? "bold";
    const count = Math.min(Math.max(input.count ?? 4, 1), 8);
    const device: Device = "iphone";
    const themeId = STYLE_THEME[style];
    const theme = themeById(themeId);
    const headlines = HEADLINES[style];
    const labels = LABELS[style];
    const sources = input.sourceImages;
    const stamp = Date.now();

    const slides: Slide[] = Array.from({ length: count }, (_, i) => {
      const layout = pickLayout(i, count);
      const src = sources.length ? sources[i % sources.length]! : undefined;
      return {
        id: `slide-${stamp}-${i}`,
        layout,
        label: labels[i % labels.length]!,
        headline: headlines[i % headlines.length]!,
        screenshot: layout === "no-device" ? "" : src?.dataUrl ?? "",
        inverted: theme.id === "dark-bold" ? false : i % 3 === 2,
      };
    });

    return {
      id: `gen-${stamp}`,
      appId: input.appId,
      appName: input.appName,
      style,
      device,
      themeId,
      createdAt: new Date().toISOString(),
      status: "done",
      slides,
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
