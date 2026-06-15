import type { AppBlueprint, BlueprintTab, CloneSource, TabKind } from "./types.js";

/* ============================================================
   Stage 1 — blueprint generation (Gemini) + hard validation.

   The model only proposes structure; validate() clamps EVERYTHING into a
   safe shape so the deterministic codegen can never receive a value that
   breaks compilation (bad hex, empty tabs, unknown SF symbols, etc.).
   ============================================================ */

/** A generate-JSON function injected by the caller (the API's Gemini seam). */
export type GenerateJson = (prompt: string, schema: Record<string, unknown>) => Promise<unknown>;

const TAB_KINDS: TabKind[] = ["feed", "list", "grid", "form", "profile"];

/** SF Symbols guaranteed to exist on iOS 17 — the model is constrained to these. */
export const SAFE_SYMBOLS = [
  "house", "house.fill", "magnifyingglass", "square.grid.2x2", "square.grid.2x2.fill",
  "list.bullet", "heart", "heart.fill", "star", "star.fill", "bolt", "bolt.fill",
  "flame", "flame.fill", "person", "person.fill", "person.crop.circle", "gearshape",
  "gearshape.fill", "bell", "bell.fill", "bookmark", "bookmark.fill", "cart", "cart.fill",
  "calendar", "clock", "chart.bar", "chart.bar.fill", "camera", "camera.fill", "photo",
  "photo.on.rectangle", "play.circle", "play.circle.fill", "message", "message.fill",
  "map", "location", "creditcard", "dollarsign.circle", "book", "book.fill", "music.note",
  "dumbbell", "dumbbell.fill", "fork.knife", "leaf", "leaf.fill", "globe", "sparkles",
  "wand.and.stars", "paintbrush", "pencil", "plus.circle", "plus.circle.fill", "tag",
  "tag.fill", "checkmark.circle", "checkmark.circle.fill", "flag", "trophy", "trophy.fill",
];

const blueprintSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    appName: { type: "string" },
    bundleId: { type: "string" },
    tagline: { type: "string" },
    accentHex: { type: "string" },
    primaryEntity: { type: "string" },
    tabs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          symbol: { type: "string", enum: SAFE_SYMBOLS },
          kind: { type: "string", enum: TAB_KINDS },
          headline: { type: "string" },
          subhead: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                subtitle: { type: "string" },
                detail: { type: "string" },
              },
              required: ["title", "subtitle", "detail"],
            },
          },
        },
        required: ["title", "symbol", "kind", "headline", "subhead", "items"],
      },
    },
  },
  required: ["appName", "bundleId", "tagline", "accentHex", "primaryEntity", "tabs"],
};

function buildPrompt(src: CloneSource): string {
  return [
    `You are an expert iOS product designer. A founder wants to build their own app`,
    `inspired by a trending App Store app. Design the clone's structure.`,
    ``,
    `TRENDING APP TO CLONE:`,
    `- Name: ${src.title}`,
    `- Developer: ${src.developer}`,
    `- Category: ${src.category ?? "unknown"}`,
    src.description ? `- Description: ${src.description.slice(0, 900)}` : "",
    ``,
    `Design a SwiftUI app that delivers the SAME core value with an original brand.`,
    `Rules:`,
    `- appName: a NEW brand (do not reuse the original name), short and memorable.`,
    `- bundleId: reverse-DNS like "com.kittieclone.<lowercasebrand>".`,
    `- accentHex: a "#RRGGBB" color fitting the category's mood.`,
    `- primaryEntity: the core noun the app revolves around (singular).`,
    `- 3 to 5 tabs. Each tab is a real screen with 4 to 6 realistic sample items`,
    `  (concrete, believable content for THIS category — not lorem ipsum).`,
    `- kind picks the screen layout: feed=large cards, list=rows, grid=tiles,`,
    `  form=create/input screen, profile=account/stats screen.`,
    `- symbol: pick the best-fitting SF Symbol from the allowed enum.`,
    `Return ONLY JSON matching the provided schema.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ---- validation / sanitization ---------------------------------------- */

function clampHex(raw: unknown): string {
  if (typeof raw === "string") {
    const m = raw.trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (m && m[1]) return `#${m[1].toUpperCase()}`;
  }
  return "#4F46E5"; // indigo fallback
}

function str(raw: unknown, fallback: string): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

function safeSymbol(raw: unknown, fallback: string): string {
  return typeof raw === "string" && SAFE_SYMBOLS.includes(raw) ? raw : fallback;
}

function safeKind(raw: unknown): TabKind {
  return TAB_KINDS.includes(raw as TabKind) ? (raw as TabKind) : "list";
}

const DEFAULT_SYMBOLS = ["house.fill", "magnifyingglass", "star.fill", "person.crop.circle", "gearshape.fill"];

function validateTab(raw: unknown, i: number): BlueprintTab {
  const t = (raw ?? {}) as Record<string, unknown>;
  const itemsRaw = Array.isArray(t.items) ? t.items : [];
  const items = itemsRaw.slice(0, 8).map((it, j) => {
    const o = (it ?? {}) as Record<string, unknown>;
    return {
      title: str(o.title, `Item ${j + 1}`),
      subtitle: str(o.subtitle, ""),
      detail: str(o.detail, ""),
    };
  });
  // guarantee at least 3 items so screens never look empty
  while (items.length < 3) items.push({ title: `Item ${items.length + 1}`, subtitle: "", detail: "" });
  return {
    title: str(t.title, `Tab ${i + 1}`),
    symbol: safeSymbol(t.symbol, DEFAULT_SYMBOLS[i % DEFAULT_SYMBOLS.length] ?? "circle.fill"),
    kind: safeKind(t.kind),
    headline: str(t.headline, str(t.title, `Tab ${i + 1}`)),
    subhead: str(t.subhead, ""),
    items,
  };
}

/** Clamp arbitrary model output into a guaranteed-renderable blueprint. */
export function validateBlueprint(raw: unknown, src: CloneSource): AppBlueprint {
  const r = (raw ?? {}) as Record<string, unknown>;
  const tabsRaw = Array.isArray(r.tabs) ? r.tabs : [];
  let tabs = tabsRaw.slice(0, 5).map(validateTab);
  if (tabs.length < 2) {
    // Degenerate model output — fall back to a sane 3-tab shell.
    tabs = [
      validateTab({ title: "Home", symbol: "house.fill", kind: "feed", headline: src.title }, 0),
      validateTab({ title: "Browse", symbol: "magnifyingglass", kind: "grid", headline: "Browse" }, 1),
      validateTab({ title: "Profile", symbol: "person.crop.circle", kind: "profile", headline: "You" }, 2),
    ];
  }
  const firstWord = src.title.split(/\s+/)[0] ?? "App";
  const brand = str(r.appName, `${firstWord} Clone`);
  return {
    appName: brand,
    bundleId: str(r.bundleId, `com.kittieclone.${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}`),
    tagline: str(r.tagline, src.category ? `A modern ${src.category} app` : "A modern mobile app"),
    accentHex: clampHex(r.accentHex),
    primaryEntity: str(r.primaryEntity, "Item"),
    tabs,
  };
}

/**
 * Generate + validate a blueprint. `gen` is the injected Gemini JSON call;
 * if it throws or returns junk, we still return a valid fallback blueprint so
 * the engine never fails to produce a buildable app.
 */
export async function generateBlueprint(src: CloneSource, gen: GenerateJson): Promise<AppBlueprint> {
  try {
    const raw = await gen(buildPrompt(src), blueprintSchema);
    return validateBlueprint(raw, src);
  } catch {
    return validateBlueprint({}, src);
  }
}
