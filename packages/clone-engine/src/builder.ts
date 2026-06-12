import { SAFE_SYMBOLS, validateBlueprint, type GenerateJson } from "./blueprint.js";
import type { AppBlueprint, BlueprintTab, TabKind } from "./types.js";

/* ============================================================
   Builder Stage 1 — prompt-driven blueprints (the Rork loop).

   Two entry points:
     buildBlueprintFromPrompt(prompt, gen?)        — "describe your app"
     reviseBlueprint(current, instruction, gen?)   — chat iteration

   Both run the model through the SAME validateBlueprint clamp as the
   listing-driven path, and both degrade to a deterministic heuristic when
   no model is configured (or the call fails) so the full product loop is
   testable offline.
   ============================================================ */

const builderSchema: Record<string, unknown> = {
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
          kind: { type: "string", enum: ["feed", "list", "grid", "form", "profile"] },
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

function createPrompt(userPrompt: string): string {
  return [
    `You are an expert mobile product designer inside an AI app builder`,
    `(like Rork). A user described the app they want. Design its structure.`,
    ``,
    `USER REQUEST:`,
    userPrompt.slice(0, 2000),
    ``,
    `Rules:`,
    `- appName: short, memorable brand fitting the request.`,
    `- bundleId: reverse-DNS like "com.rorkclone.<lowercasebrand>".`,
    `- accentHex: a "#RRGGBB" color fitting the app's mood.`,
    `- primaryEntity: the core noun the app revolves around (singular).`,
    `- 2 to 5 tabs. Each tab is a real screen with 4 to 6 realistic sample items`,
    `  (concrete, believable content for THIS app — not lorem ipsum).`,
    `- kind picks the layout: feed=large cards, list=rows, grid=tiles,`,
    `  form=create/input screen, profile=account/stats screen.`,
    `- symbol: best-fitting SF Symbol from the allowed enum.`,
    `Return ONLY JSON matching the provided schema.`,
  ].join("\n");
}

function revisePrompt(current: AppBlueprint, instruction: string): string {
  return [
    `You are an expert mobile product designer inside an AI app builder.`,
    `The user wants to CHANGE their existing app. Apply the instruction to the`,
    `current blueprint and return the COMPLETE updated blueprint.`,
    ``,
    `CURRENT BLUEPRINT (JSON):`,
    JSON.stringify(current),
    ``,
    `USER INSTRUCTION:`,
    instruction.slice(0, 1000),
    ``,
    `Rules:`,
    `- Keep everything the user did NOT ask to change exactly as-is.`,
    `- Same schema constraints as before (2-5 tabs, allowed symbols/kinds,`,
    `  "#RRGGBB" accentHex, realistic sample items).`,
    `Return ONLY JSON matching the provided schema.`,
  ].join("\n");
}

/* ---- deterministic heuristic fallback ---------------------------------- */

interface Archetype {
  match: RegExp;
  entity: string;
  accent: string;
  tabs: Partial<BlueprintTab>[];
}

const ARCHETYPES: Archetype[] = [
  {
    match: /habit|streak|routine|tracker|sober|quit/i,
    entity: "Habit",
    accent: "#34C759",
    tabs: [
      { title: "Today", symbol: "checkmark.circle.fill", kind: "list", headline: "Today" },
      { title: "Stats", symbol: "chart.bar.fill", kind: "feed", headline: "Your momentum" },
      { title: "New", symbol: "plus.circle.fill", kind: "form", headline: "New habit" },
      { title: "Profile", symbol: "person.crop.circle", kind: "profile", headline: "You" },
    ],
  },
  {
    match: /fitness|workout|gym|run|exercise/i,
    entity: "Workout",
    accent: "#FF375F",
    tabs: [
      { title: "Train", symbol: "dumbbell.fill", kind: "feed", headline: "Today's session" },
      { title: "Plans", symbol: "square.grid.2x2.fill", kind: "grid", headline: "Programs" },
      { title: "Log", symbol: "plus.circle.fill", kind: "form", headline: "Log a workout" },
      { title: "Profile", symbol: "person.crop.circle", kind: "profile", headline: "Athlete" },
    ],
  },
  {
    match: /recipe|food|meal|cook|nutrition|diet/i,
    entity: "Recipe",
    accent: "#FF9F0A",
    tabs: [
      { title: "Discover", symbol: "fork.knife", kind: "feed", headline: "What's cooking" },
      { title: "Browse", symbol: "square.grid.2x2", kind: "grid", headline: "By cuisine" },
      { title: "Saved", symbol: "bookmark.fill", kind: "list", headline: "Your cookbook" },
    ],
  },
  {
    match: /shop|store|commerce|market|sell|buy/i,
    entity: "Product",
    accent: "#0A84FF",
    tabs: [
      { title: "Shop", symbol: "square.grid.2x2.fill", kind: "grid", headline: "New arrivals" },
      { title: "Cart", symbol: "cart.fill", kind: "list", headline: "Your cart" },
      { title: "Account", symbol: "person.crop.circle", kind: "profile", headline: "Account" },
    ],
  },
  {
    match: /journal|diary|note|mood|mind|meditat/i,
    entity: "Entry",
    accent: "#BF5AF2",
    tabs: [
      { title: "Journal", symbol: "book.fill", kind: "feed", headline: "Your entries" },
      { title: "Write", symbol: "pencil", kind: "form", headline: "New entry" },
      { title: "Insights", symbol: "sparkles", kind: "list", headline: "Patterns" },
    ],
  },
  {
    match: /chat|message|social|friend|community/i,
    entity: "Conversation",
    accent: "#32D74B",
    tabs: [
      { title: "Chats", symbol: "message.fill", kind: "list", headline: "Messages" },
      { title: "Discover", symbol: "sparkles", kind: "grid", headline: "Find people" },
      { title: "Profile", symbol: "person.crop.circle", kind: "profile", headline: "You" },
    ],
  },
];

const GENERIC: Archetype = {
  match: /.*/,
  entity: "Item",
  accent: "#4F46E5",
  tabs: [
    { title: "Home", symbol: "house.fill", kind: "feed", headline: "Home" },
    { title: "Browse", symbol: "magnifyingglass", kind: "grid", headline: "Browse" },
    { title: "Add", symbol: "plus.circle.fill", kind: "form", headline: "Add new" },
    { title: "Profile", symbol: "person.crop.circle", kind: "profile", headline: "You" },
  ],
};

/** First few meaningful words of the prompt, title-cased -> brand name. */
function brandFrom(prompt: string): string {
  const STOP = new Set(["a", "an", "the", "app", "for", "that", "with", "my", "to", "of", "i", "want", "build", "make", "create"]);
  const words = (prompt.match(/[A-Za-z]+/g) ?? [])
    .filter((w) => !STOP.has(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join("") || "MyApp";
}

function heuristicItems(entity: string, tab: Partial<BlueprintTab>): { title: string; subtitle: string; detail: string }[] {
  return [1, 2, 3, 4].map((n) => ({
    title: `${entity} ${n}`,
    subtitle: `Sample ${entity.toLowerCase()} description`,
    detail: tab.kind === "feed" ? "Featured" : `#${n}`,
  }));
}

/** Deterministic blueprint from prompt keywords — the offline path. */
export function heuristicBlueprint(prompt: string): AppBlueprint {
  const arch = ARCHETYPES.find((a) => a.match.test(prompt)) ?? GENERIC;
  const brand = brandFrom(prompt);
  const raw = {
    appName: brand,
    bundleId: `com.rorkclone.${brand.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    tagline: prompt.trim().slice(0, 80) || "Your app, generated",
    accentHex: arch.accent,
    primaryEntity: arch.entity,
    tabs: arch.tabs.map((t) => ({
      ...t,
      subhead: t.subhead ?? "",
      items: heuristicItems(arch.entity, t),
    })),
  };
  return validateBlueprint(raw, { id: "builder", title: brand, developer: "builder", category: null, description: prompt });
}

/* ---- heuristic revision (offline chat loop) ---------------------------- */

const KIND_WORDS: [RegExp, TabKind][] = [
  [/feed|card/i, "feed"],
  [/grid|tile|gallery/i, "grid"],
  [/form|input|create|add/i, "form"],
  [/profile|account|settings/i, "profile"],
  [/list|row/i, "list"],
];

const NAMED_COLORS: Record<string, string> = {
  red: "#FF3B30", orange: "#FF9500", yellow: "#FFCC00", green: "#34C759",
  mint: "#00C7BE", teal: "#30B0C7", cyan: "#32ADE6", blue: "#007AFF",
  indigo: "#5856D6", purple: "#AF52DE", pink: "#FF2D55", brown: "#A2845E",
  black: "#1C1C1E", white: "#F2F2F7", gold: "#D4AF37", lime: "#C6F24D",
};

/** Deterministic revision — handles the common chat asks without a model. */
export function heuristicRevise(current: AppBlueprint, instruction: string): AppBlueprint {
  const next: AppBlueprint = JSON.parse(JSON.stringify(current));
  const lower = instruction.toLowerCase();

  // color change: "#RRGGBB" or a named color following color-ish wording
  const hex = instruction.match(/#([0-9a-fA-F]{6})\b/);
  if (hex) next.accentHex = `#${hex[1]!.toUpperCase()}`;
  else if (/colou?r|accent|theme/i.test(instruction)) {
    for (const [name, value] of Object.entries(NAMED_COLORS)) {
      if (lower.includes(name)) { next.accentHex = value; break; }
    }
  }

  // rename: `rename ... to X` / `call it X`
  const rename = instruction.match(/(?:rename|call (?:it|the app))(?:.*?\bto\b)?\s+"?([A-Za-z][A-Za-z0-9 ]{1,30})"?\s*$/i);
  if (rename) next.appName = rename[1]!.trim();

  // remove tab: "remove/delete the X tab"
  const remove = instruction.match(/(?:remove|delete)\s+(?:the\s+)?"?([A-Za-z][A-Za-z0-9 ]{0,20}?)"?\s+(?:tab|screen|page)/i);
  if (remove && next.tabs.length > 2) {
    const target = remove[1]!.trim().toLowerCase();
    const idx = next.tabs.findIndex((t) => t.title.toLowerCase() === target);
    if (idx >= 0) next.tabs.splice(idx, 1);
  }

  // add tab: "add a X tab/screen"
  const add = instruction.match(/add\s+(?:an?\s+)?"?([A-Za-z][A-Za-z0-9 ]{0,20}?)"?\s+(?:tab|screen|page)/i);
  if (add && next.tabs.length < 5) {
    const title = add[1]!.trim();
    // Title wins over the rest of the instruction — "add a profile tab"
    // must not classify as "form" just because the verb is "add".
    const rest = instruction.replace(add[0]!, "");
    const kind = KIND_WORDS.find(([re]) => re.test(title))?.[1]
      ?? KIND_WORDS.find(([re]) => re.test(rest))?.[1]
      ?? "list";
    next.tabs.push({
      title: title.charAt(0).toUpperCase() + title.slice(1),
      symbol: kind === "profile" ? "person.crop.circle" : kind === "form" ? "plus.circle.fill" : "star.fill",
      kind,
      headline: title.charAt(0).toUpperCase() + title.slice(1),
      subhead: "",
      items: heuristicItems(next.primaryEntity, { kind }),
    });
  }

  return validateBlueprint(next, {
    id: "builder",
    title: next.appName,
    developer: "builder",
    category: null,
    description: instruction,
  });
}

/* ---- public entry points ------------------------------------------------ */

/** Prompt -> blueprint. Uses the model when provided, heuristic otherwise. */
export async function buildBlueprintFromPrompt(prompt: string, gen?: GenerateJson): Promise<AppBlueprint> {
  if (!gen) return heuristicBlueprint(prompt);
  try {
    const raw = await gen(createPrompt(prompt), builderSchema);
    return validateBlueprint(raw, {
      id: "builder",
      title: brandFrom(prompt),
      developer: "builder",
      category: null,
      description: prompt,
    });
  } catch {
    return heuristicBlueprint(prompt);
  }
}

/** Chat instruction -> updated blueprint. Model when provided, heuristic otherwise. */
export async function reviseBlueprint(
  current: AppBlueprint,
  instruction: string,
  gen?: GenerateJson,
): Promise<AppBlueprint> {
  if (!gen) return heuristicRevise(current, instruction);
  try {
    const raw = await gen(revisePrompt(current, instruction), builderSchema);
    return validateBlueprint(raw, {
      id: "builder",
      title: current.appName,
      developer: "builder",
      category: null,
      description: instruction,
    });
  } catch {
    return heuristicRevise(current, instruction);
  }
}
