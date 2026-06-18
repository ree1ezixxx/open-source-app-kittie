/**
 * translationService — the single typed contract the Screenshot Translation
 * surface consumes.
 *
 * MOCK: `translateScreenshots` returns the uploaded frames tagged per target
 * country after a short fake delay. A real OCR + machine-translation backend
 * slots in behind the same `TranslationService` interface — the page only
 * talks to this contract, so the swap is one line at the bottom of this file.
 *
 * Also owns the "Recent Translations" history (localStorage) and a read-only
 * view of the apps tracked on the App Tracking page.
 */
import type { UploadedImage } from "./aiService";

/* ============================================================ Countries */

export interface TranslationCountry {
  /** ISO-3166 alpha-2 country code. */
  code: string;
  name: string;
  /** Emoji flag. */
  flag: string;
  /** Display name of the target App Store language. */
  language: string;
}

// Mirrors appkittie's Screenshot-Translation locale list exactly (Country ·
// Language · CODE), in the same order. `code` is the App-Store language code
// shown on the chip; `language` is the target language sent to the translator.
export const TRANSLATION_COUNTRIES: TranslationCountry[] = [
  { code: "EN", name: "United States", flag: "🇺🇸", language: "English" },
  { code: "DE", name: "Germany", flag: "🇩🇪", language: "German" },
  { code: "FR", name: "France", flag: "🇫🇷", language: "French" },
  { code: "ES", name: "Spain", flag: "🇪🇸", language: "Spanish" },
  { code: "IT", name: "Italy", flag: "🇮🇹", language: "Italian" },
  { code: "PT", name: "Brazil", flag: "🇧🇷", language: "Portuguese" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", language: "Dutch" },
  { code: "SV", name: "Sweden", flag: "🇸🇪", language: "Swedish" },
  { code: "NO", name: "Norway", flag: "🇳🇴", language: "Norwegian" },
  { code: "DA", name: "Denmark", flag: "🇩🇰", language: "Danish" },
  { code: "FI", name: "Finland", flag: "🇫🇮", language: "Finnish" },
  { code: "ZH-CN", name: "China", flag: "🇨🇳", language: "Chinese (Simplified)" },
  { code: "ZH-TW", name: "Taiwan", flag: "🇹🇼", language: "Chinese (Traditional)" },
  { code: "JA", name: "Japan", flag: "🇯🇵", language: "Japanese" },
  { code: "KO", name: "South Korea", flag: "🇰🇷", language: "Korean" },
  { code: "AF", name: "South Africa", flag: "🇿🇦", language: "Afrikaans" },
  { code: "SQ", name: "Albania", flag: "🇦🇱", language: "Albanian" },
  { code: "AR", name: "Saudi Arabia", flag: "🇸🇦", language: "Arabic" },
  { code: "AZ", name: "Azerbaijan", flag: "🇦🇿", language: "Azerbaijani" },
  { code: "BN", name: "Bangladesh", flag: "🇧🇩", language: "Bengali" },
  { code: "BG", name: "Bulgaria", flag: "🇧🇬", language: "Bulgarian" },
  { code: "CA", name: "Andorra", flag: "🇦🇩", language: "Catalan" },
  { code: "HR", name: "Croatia", flag: "🇭🇷", language: "Croatian" },
  { code: "CS", name: "Czech Republic", flag: "🇨🇿", language: "Czech" },
  { code: "ET", name: "Estonia", flag: "🇪🇪", language: "Estonian" },
  { code: "FA", name: "Iran", flag: "🇮🇷", language: "Persian" },
  { code: "GU", name: "Gujarat", flag: "🇮🇳", language: "Gujarati" },
  { code: "HE", name: "Israel", flag: "🇮🇱", language: "Hebrew" },
  { code: "HI", name: "India", flag: "🇮🇳", language: "Hindi" },
  { code: "HU", name: "Hungary", flag: "🇭🇺", language: "Hungarian" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", language: "Indonesian" },
  { code: "KK", name: "Kazakhstan", flag: "🇰🇿", language: "Kazakh" },
  { code: "KN", name: "Karnataka", flag: "🇮🇳", language: "Kannada" },
  { code: "LV", name: "Latvia", flag: "🇱🇻", language: "Latvian" },
  { code: "LT", name: "Lithuania", flag: "🇱🇹", language: "Lithuanian" },
  { code: "MK", name: "North Macedonia", flag: "🇲🇰", language: "Macedonian" },
  { code: "MS", name: "Malaysia", flag: "🇲🇾", language: "Malay" },
  { code: "ML", name: "Kerala", flag: "🇮🇳", language: "Malayalam" },
  { code: "MR", name: "Maharashtra", flag: "🇮🇳", language: "Marathi" },
  { code: "NE", name: "Nepal", flag: "🇳🇵", language: "Nepali" },
  { code: "PA", name: "Punjab", flag: "🇮🇳", language: "Punjabi" },
  { code: "PL", name: "Poland", flag: "🇵🇱", language: "Polish" },
  { code: "RO", name: "Romania", flag: "🇷🇴", language: "Romanian" },
  { code: "RU", name: "Russia", flag: "🇷🇺", language: "Russian" },
  { code: "SR", name: "Serbia", flag: "🇷🇸", language: "Serbian" },
  { code: "SK", name: "Slovakia", flag: "🇸🇰", language: "Slovak" },
  { code: "SL", name: "Slovenia", flag: "🇸🇮", language: "Slovenian" },
  { code: "SO", name: "Somalia", flag: "🇸🇴", language: "Somali" },
  { code: "SW", name: "Kenya", flag: "🇰🇪", language: "Swahili" },
  { code: "TA", name: "Tamil Nadu", flag: "🇮🇳", language: "Tamil" },
  { code: "TE", name: "Andhra Pradesh", flag: "🇮🇳", language: "Telugu" },
  { code: "TH", name: "Thailand", flag: "🇹🇭", language: "Thai" },
  { code: "TL", name: "Philippines", flag: "🇵🇭", language: "Tagalog" },
  { code: "TR", name: "Turkey", flag: "🇹🇷", language: "Turkish" },
  { code: "UK", name: "Ukraine", flag: "🇺🇦", language: "Ukrainian" },
  { code: "UR", name: "Pakistan", flag: "🇵🇰", language: "Urdu" },
  { code: "UZ", name: "Uzbekistan", flag: "🇺🇿", language: "Uzbek" },
  { code: "VI", name: "Vietnam", flag: "🇻🇳", language: "Vietnamese" },
  { code: "CY", name: "Wales", flag: "🇬🇧", language: "Welsh" },
];

/** Quick-select default markets (mirrors truth's "Select 3"). */
export const POPULAR_COUNTRY_CODES = ["EN", "DE", "FR"];

export function countryByCode(code: string): TranslationCountry | undefined {
  return TRANSLATION_COUNTRIES.find((c) => c.code === code);
}

/* ============================================================ Types */

export type TranslationStatus = "done" | "error";

export interface TranslateScreenshotsInput {
  /** Tracked App id, or null when translating manually-uploaded frames. */
  appId?: string | null;
  /** Label for the history entry — e.g. the tracked app's title. */
  appName?: string;
  /** Source frames (base64 data URLs from the shared uploader). */
  images: UploadedImage[];
  /** ISO-3166 alpha-2 codes — see TRANSLATION_COUNTRIES. */
  countries: string[];
}

/** One source frame localized for one country. */
export interface TranslatedImage extends UploadedImage {
  /** id of the source frame this was derived from. */
  sourceId: string;
  countryCode: string;
  language: string;
  /** Real Gemini-vision translations of the frame's marketing text (live mode). */
  translatedLines?: Array<{ source: string; translated: string }>;
}

export interface CountryTranslationGroup {
  country: TranslationCountry;
  images: TranslatedImage[];
}

export interface TranslationResult {
  id: string;
  appId: string | null;
  appName: string;
  createdAt: string; // ISO
  status: TranslationStatus;
  /** How many source frames went in. */
  sourceCount: number;
  /** One group per target country, in the order requested. */
  groups: CountryTranslationGroup[];
}

export interface TranslationService {
  translateScreenshots(input: TranslateScreenshotsInput): Promise<TranslationResult>;
}

/* ============================================================ Integration flag */

export const TRANSLATION_SERVICE_MODE: "mock" | "live" = "live";

let warned = false;
function flagMockOnce() {
  if (warned || typeof console === "undefined") return;
  warned = true;
  console.info(
    "[translationService] translateScreenshots is a MOCK — frames are tagged per country. Wire a real OCR + translate backend behind TranslationService to localize on-image text.",
  );
}

/* ============================================================ Mock service */

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** "onboarding.png" + DE → "onboarding · DE" */
function localizedName(name: string, code: string): string {
  const base = name.replace(/\.(png|jpe?g|webp|gif)$/i, "");
  return `${base} · ${code}`;
}

export const mockTranslationService: TranslationService = {
  async translateScreenshots(input) {
    flagMockOnce();
    await delay(900);

    const stamp = Date.now();
    const groups: CountryTranslationGroup[] = [];
    for (const code of input.countries) {
      const country = countryByCode(code);
      if (!country) continue; // ignore unknown codes rather than failing the batch
      groups.push({
        country,
        images: input.images.map((img, i) => ({
          id: `tr-${stamp}-${country.code.toLowerCase()}-${i}`,
          name: localizedName(img.name, country.code),
          dataUrl: img.dataUrl, // mock: source frame passed through, tagged per country
          sourceId: img.id,
          countryCode: country.code,
          language: country.language,
        })),
      });
    }

    return {
      id: `trans-${stamp}`,
      appId: input.appId ?? null,
      appName: input.appName?.trim() || "Manual upload",
      createdAt: new Date(stamp).toISOString(),
      status: "done",
      sourceCount: input.images.length,
      groups,
    };
  },
};

/* ============================================================ Live service */

/** One frame → one country: Gemini vision reads + translates the on-image text. */
async function translateFrame(
  dataUrl: string,
  language: string,
  countryCode: string,
): Promise<Array<{ source: string; translated: string }> | null> {
  try {
    const res = await fetch("/api/v1/ai/translate-screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: dataUrl, language, countryCode }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: { lines: Array<{ source: string; translated: string }> } };
    return body.data.lines;
  } catch {
    return null;
  }
}

/**
 * LIVE translation: real Gemini-vision translation of each frame's marketing
 * text per target country, attached as translatedLines. Frames themselves are
 * never fake-edited — we show honest translated copy alongside the source
 * frame. Falls back to tag-only grouping when the model is unavailable.
 */
export const liveTranslationService: TranslationService = {
  async translateScreenshots(input) {
    const stamp = Date.now();
    const groups: CountryTranslationGroup[] = [];
    for (const code of input.countries) {
      const country = countryByCode(code);
      if (!country) continue;
      const images: TranslatedImage[] = [];
      for (const [i, img] of input.images.entries()) {
        const lines = await translateFrame(img.dataUrl, country.language, country.code);
        images.push({
          id: `tr-${stamp}-${country.code.toLowerCase()}-${i}`,
          name: localizedName(img.name, country.code),
          dataUrl: img.dataUrl,
          sourceId: img.id,
          countryCode: country.code,
          language: country.language,
          ...(lines ? { translatedLines: lines } : {}),
        });
      }
      groups.push({ country, images });
    }

    return {
      id: `trans-${stamp}`,
      appId: input.appId ?? null,
      appName: input.appName?.trim() || "Manual upload",
      createdAt: new Date(stamp).toISOString(),
      status: "done",
      sourceCount: input.images.length,
      groups,
    };
  },
};

/** Active service — LIVE (Gemini vision); falls back per-frame to tag-only. */
export const translationService: TranslationService = liveTranslationService;

/* ============================================================ History (localStorage) */

const HISTORY_KEY = "kittie.aso.translations.v1";
const HISTORY_MAX = 12;

export function loadTranslationHistory(): TranslationResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TranslationResult[]) : [];
  } catch {
    return [];
  }
}

/**
 * Persist history. Base64 frames are heavy, so on quota errors we drop the
 * oldest entries until the write fits (or give up silently at zero).
 */
export function persistTranslationHistory(items: TranslationResult[]): void {
  let next = items.slice(0, HISTORY_MAX);
  for (;;) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return;
    } catch {
      if (next.length === 0) return;
      next = next.slice(0, next.length - 1);
    }
  }
}

/* ============================================================ Tracked apps (read-only) */

/** Same key the App Tracking page writes — we only ever read it here. */
const TRACKED_APPS_KEY = "kittie.aso.trackedApps";

export interface TrackedAppSummary {
  id: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  category: string | null;
}

export function loadTrackedApps(): TrackedAppSummary[] {
  try {
    const raw = localStorage.getItem(TRACKED_APPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Array<Record<string, unknown>>)
      .filter((a) => typeof a?.id === "string" && typeof a?.title === "string")
      .map((a) => ({
        id: a.id as string,
        title: a.title as string,
        developer: typeof a.developer === "string" ? a.developer : "",
        iconUrl: typeof a.iconUrl === "string" ? a.iconUrl : null,
        category: typeof a.category === "string" ? a.category : null,
      }));
  } catch {
    return [];
  }
}
