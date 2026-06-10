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

export const TRANSLATION_COUNTRIES: TranslationCountry[] = [
  { code: "US", name: "United States", flag: "🇺🇸", language: "English (US)" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", language: "English (UK)" },
  { code: "DE", name: "Germany", flag: "🇩🇪", language: "German" },
  { code: "FR", name: "France", flag: "🇫🇷", language: "French" },
  { code: "IT", name: "Italy", flag: "🇮🇹", language: "Italian" },
  { code: "ES", name: "Spain", flag: "🇪🇸", language: "Spanish" },
  { code: "JP", name: "Japan", flag: "🇯🇵", language: "Japanese" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", language: "Portuguese (BR)" },
  { code: "MX", name: "Mexico", flag: "🇲🇽", language: "Spanish (MX)" },
  { code: "KR", name: "South Korea", flag: "🇰🇷", language: "Korean" },
];

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

export const TRANSLATION_SERVICE_MODE: "mock" | "live" = "mock";

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

/** Active service. Swap to a live impl when the OCR + translate backend lands. */
export const translationService: TranslationService = mockTranslationService;

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
