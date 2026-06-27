// ── Trending Ideas — prototype mock dataset ────────────────────────────────
// Self-contained. No API dependency: this canvas runs on its own port with
// modelled/illustrative data so the redesign can be iterated visually.
// Numbers are ESTIMATES (the real product models these); never ground truth.

export type Momentum = "hot" | "rising" | "steady";

export type App = {
  slug: string;
  name: string;
  category: string;
  hue: number; // logo gradient base hue (fallback when no icon)
  icon?: string; // real App Store icon URL (Apple mzstatic CDN)
  reason: string; // one-line trend indicator
  momentum: Momentum;
  delta: number; // % movement signal
  downloads: string; // est / mo
  revenue: string; // est / mo
  rating: number;
};

export type Idea = {
  category: string;
  title: string;
  oneLiner: string;
  confidence: number; // 0–100
  difficulty: "Low" | "Medium" | "High";
  freshness: string;
  monetization: "Low" | "Medium" | "High";
  whyNow: string;
  reasons: string[]; // interpreted signals
  wedge: string;
  stack: string[];
  copy: string[];
  avoid: string[];
  brief: {
    targetUser: string;
    mvp: string[];
    screens: string[];
    coreLoop: string;
    dataModel: string[];
    monetizationPlan: string;
    risks: string[];
  };
};

export const CATEGORIES = [
  "All",
  "Health",
  "Photo & Video",
  "Utility",
  "Productivity",
  "Finance",
  "AI",
  "Education",
  "Games",
  "Lifestyle",
  "Creator Tools",
] as const;

// Per-category logo color family (base hue) ----------------------------------
const HUE: Record<string, number> = {
  Health: 150,
  "Photo & Video": 280,
  Utility: 210,
  Productivity: 25,
  Finance: 160,
  AI: 250,
  Education: 200,
  Games: 330,
  Lifestyle: 12,
  "Creator Tools": 300,
};

type Seed = [name: string, reason: string, momentum: Momentum, delta: number];

// deterministic pseudo-metrics so the wall feels alive without a backend
function metrics(name: string, momentum: Momentum) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const base = momentum === "hot" ? 9 : momentum === "rising" ? 4 : 2;
  const dl = base * 10 + (h % 90); // K/mo
  const rev = base * 8 + (h % 70); // K/mo
  const rating = 4.1 + ((h >> 3) % 9) / 10;
  const fmt = (n: number) => (n >= 100 ? `${(n / 10).toFixed(0)}0K` : `${n}K`);
  return { downloads: fmt(dl), revenue: `$${fmt(rev)}`, rating: Math.min(4.9, +rating.toFixed(1)) };
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function build(category: string, seeds: Seed[]): App[] {
  return seeds.map(([name, reason, momentum, delta]) => ({
    slug: slugify(name),
    name,
    category,
    hue: HUE[category] ?? 150,
    reason,
    momentum,
    delta,
    ...metrics(name, momentum),
  }));
}

// Real App Store icons (Apple mzstatic CDN, 256px). Movers only — no incumbents.
const HEALTH_ICONS: Record<string, string> = {
  "Cal AI":
    "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/ac/19/7c/ac197c1f-5dc9-2c14-79fb-952bcd119614/AppIcon-0-1x_U007ephone-0-1-85-220-0.png/256x256bb.jpg",
  Finch:
    "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/f7/bf/ad/f7bfadd0-e986-4df9-a3f4-c94bda00f30b/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.jpg",
  Rise:
    "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e4/01/a4/e401a461-b669-d3cb-038b-4d0891d4fa09/App-Icon-Glass-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/256x256bb.jpg",
  Bend:
    "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/96/fd/09/96fd0917-d515-f336-e299-6691ffcbb553/App-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/256x256bb.jpg",
  Sunnyside:
    "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/35/a4/70/35a47069-263e-9ce1-f977-e8a75f17cb17/AppIcon-0-0-1x_U007emarketing-0-6-0-85-220.png/256x256bb.jpg",
  Zero:
    "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/6c/4c/4b/6c4c4b00-7104-0c45-0024-594925601861/AppIcon-0-1x_U007ephone-0-1-0-85-220-0.png/256x256bb.jpg",
  Bearable:
    "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/fd/76/ac/fd76acf4-fa1f-e221-c375-c141300fe95c/AppIcon-0-0-1x_U007ephone-0-9-0-85-220.jpeg/256x256bb.jpg",
  Welltory:
    "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/06/61/d7/0661d79c-0d43-a2c1-ff3d-ceac092011db/AppIcon_free-0-0-1x_U007ephone-0-1-0-85-220.png/256x256bb.jpg",
};

export const APPS: App[] = [
  ...build("Health", [
    ["Cal AI", "Photo calorie logging spike", "hot", 41],
    ["Finch", "Self-care pet retention loop", "rising", 22],
    ["Rise", "Sleep-debt framing trending", "rising", 18],
    ["Bend", "Stretching streaks rising", "rising", 14],
    ["Sunnyside", "Mindful-drinking reviews up", "hot", 33],
    ["Zero", "Fasting + food tracking combo", "rising", 27],
    ["Bearable", "Symptom journaling demand", "steady", 6],
    ["Welltory", "Wearable-free recovery angle", "rising", 19],
  ]).map((a) => ({ ...a, icon: HEALTH_ICONS[a.name] })),
  ...build("Photo & Video", [
    ["Lapse", "Disposable-camera nostalgia", "hot", 38],
    ["Retake", "AI re-shoot of bad photos", "hot", 44],
    ["Photoroom", "Background AI for sellers", "rising", 21],
    ["Captures", "Memory-board export loop", "rising", 16],
    ["RetouchAI", "One-tap object removal", "rising", 24],
    ["Filmbox", "Analog film LUTs viral", "steady", 8],
    ["Loopvid", "Auto-recap reels for trips", "rising", 17],
    ["Framed", "Print-to-order upsell", "steady", 5],
  ]),
  ...build("Utility", [
    ["Cleaner Pro", "Storage-cleanup IAP density", "hot", 29],
    ["Pinned", "Lockscreen widget revival", "rising", 20],
    ["Scanly", "Doc scanner + AI summarise", "rising", 23],
    ["Decibel", "Noise-meter niche spike", "steady", 7],
    ["Volt", "Battery-health upsell", "steady", 4],
    ["NetSpeed", "Speed test ad-heavy winner", "rising", 12],
    ["Eject", "Subscription-canceller demand", "hot", 31],
    ["QRdeck", "QR + NFC creator tools", "rising", 15],
  ]),
  ...build("Productivity", [
    ["Structured", "Visual day-planner growth", "rising", 19],
    ["Saner", "ADHD-friendly task framing", "hot", 28],
    ["Tide", "Calendar + focus blend", "rising", 13],
    ["Notecal", "Notes that become events", "rising", 16],
    ["Focusly", "Body-doubling sessions", "rising", 21],
    ["Tasked", "Voice-to-task capture", "steady", 6],
  ]),
  ...build("Finance", [
    ["Trimly", "Bill-negotiation reviews up", "hot", 35],
    ["Copilot", "Net-worth dashboards demand", "rising", 18],
    ["Tabby", "Group-expense splitting", "rising", 14],
    ["Yield", "HYSA-comparison wedge", "steady", 7],
    ["Cashly", "Cash-stuffing budget loop", "rising", 22],
    ["Receipted", "Warranty + receipt vault", "steady", 5],
  ]),
  ...build("AI", [
    ["Promptly", "Prompt-library monetization", "hot", 39],
    ["Vio", "On-device voice agent", "rising", 25],
    ["Chatterbox", "AI-companion retention", "hot", 30],
    ["Studio", "Agent-builder no-code", "rising", 20],
    ["Voicely", "Voice-note → doc summarise", "rising", 17],
    ["Personae", "Roleplay characters viral", "steady", 9],
  ]),
];

export const CATEGORY_PULSE: Record<string, string> = {
  Health: "12 rising apps · 4 strong subscription signals · 7 review-pain clusters",
  "Photo & Video": "18 rising apps · 9 AI-editing signals · 5 ad-heavy winners",
  Utility: "9 rising apps · high IAP density · low design quality",
  Productivity: "11 rising apps · ADHD-framing surge · weak retention loops",
  Finance: "8 rising apps · bill-negotiation heat · trust-gate friction",
  AI: "21 rising apps · companion + agent split · churn risk high",
};

export const PULSE_TAGLINE: Record<string, string> = {
  Health: "Health is moving",
  "Photo & Video": "Photo & Video is heating up",
  Utility: "Utility apps with strong monetization",
  Productivity: "Productivity is fragmenting",
  Finance: "Finance trust-wedges opening",
  AI: "AI companions vs agents",
};

// Idea templates — one rich, buildable interpretation per category -----------
export const IDEAS: Record<string, Idea> = {
  Health: {
    category: "Health",
    title: "AI Meal-Photo Journal",
    oneLiner:
      "A visual food diary pattern is trending across health, photo, and wellness apps.",
    confidence: 82,
    difficulty: "Medium",
    freshness: "Hot — last 30 days",
    monetization: "High",
    whyNow:
      "Food-logging apps with image-first UX are showing stronger movement than traditional calorie trackers. Reviews suggest users want memory, visual history, and lightweight logging — not spreadsheet-style nutrition tracking.",
    reasons: [
      "Downloads rising across photo-first loggers",
      "Subscription signals strong (annual paywall after 3 logs)",
      "Review clusters: 'too tedious', 'want photos not numbers'",
      "Keyword demand: 'photo calorie', 'food diary' climbing",
      "Category timing: post-resolution lull, AI novelty intact",
    ],
    wedge:
      "A lightweight AI meal-photo journal that lets users log meals visually, get gentle feedback, and view their week as a memory board.",
    stack: [
      "Native iOS or React Native",
      "Subscription / IAP monetization",
      "Image upload + compression",
      "Lightweight user profile",
      "Push notifications",
      "Server-side vision model (estimate only)",
    ],
    copy: [
      "Fast, frictionless onboarding",
      "Visual-first interaction",
      "Clear subscription moment",
      "Narrow use case",
      "Simple daily loop",
    ],
    avoid: [
      "Broad feature surface",
      "Expensive AI before validation",
      "Overloaded dashboard",
      "Unclear retention loop",
    ],
    brief: {
      targetUser: "Casual health-trackers who abandoned spreadsheet calorie apps",
      mvp: [
        "Snap a meal → AI estimate + gentle note",
        "Weekly memory-board view",
        "Streak + soft reminder",
        "Single annual paywall",
      ],
      screens: ["Camera/log", "Today feed", "Week board", "Insight card", "Paywall"],
      coreLoop: "Snap → estimate → react → see week fill up → return tomorrow",
      dataModel: ["User", "Meal(photo, estimate, note, ts)", "Day", "Streak"],
      monetizationPlan: "Free 3 logs/day → annual sub for unlimited + insights",
      risks: ["Vision accuracy expectations", "Privacy of food photos", "Retention past week 2"],
    },
  },
  "Photo & Video": {
    category: "Photo & Video",
    title: "AI Re-Shoot Camera",
    oneLiner: "Image-first 'fix my photo' tools are outpacing classic filter apps.",
    confidence: 78,
    difficulty: "Medium",
    freshness: "Hot — last 14 days",
    monetization: "High",
    whyNow:
      "Nostalgia capture and one-tap AI cleanup are both spiking. Users want results without an editing skill curve — the winners hide the model behind a single button.",
    reasons: [
      "AI-editing signals across 9 rising apps",
      "Ad-heavy winners → proven paid acquisition",
      "Reviews: 'too many steps', 'just make it good'",
      "Keyword: 'retake photo', 'ai photo fix' climbing",
    ],
    wedge:
      "A one-button camera that re-shoots a bad photo into a good one — same framing, fixed light, eyes open.",
    stack: [
      "React Native or native camera",
      "Credit + subscription hybrid",
      "On-device pre-process + server diffusion",
      "Share-sheet export",
      "Push for 'your photo is ready'",
    ],
    copy: ["One-tap result", "Before/after reveal", "Generous first result", "Share-out loop"],
    avoid: ["Pro editor surface", "Manual layer tools", "Slow render with no feedback"],
    brief: {
      targetUser: "Casual phone photographers who want better shots, not editing",
      mvp: ["Pick/snap photo", "One-tap re-shoot", "Before/after slider", "Credit paywall"],
      screens: ["Camera", "Processing", "Reveal", "Gallery", "Paywall"],
      coreLoop: "Bad photo → tap → reveal → share → buy credits",
      dataModel: ["User", "Render(input, output, credits)", "CreditWallet"],
      monetizationPlan: "3 free renders → credit packs + weekly sub",
      risks: ["Render cost per use", "Quality variance", "Content moderation"],
    },
  },
  Utility: {
    category: "Utility",
    title: "Subscription Canceller",
    oneLiner: "High-IAP utility apps with low design quality leave a premium wedge open.",
    confidence: 74,
    difficulty: "Low",
    freshness: "Rising — last 30 days",
    monetization: "Medium",
    whyNow:
      "Utility chart is dense with monetizing-but-ugly apps. A trustworthy, well-designed take on 'find & cancel my subscriptions' converts because the pain is concrete and recurring.",
    reasons: [
      "High IAP density in category",
      "Low design quality across incumbents",
      "Reviews: 'scammy', 'hard to cancel the canceller'",
      "Keyword: 'cancel subscriptions', 'hidden charges'",
    ],
    wedge:
      "A clean subscription tracker that finds recurring charges from email/bank and cancels with one tap — trust-first, no dark patterns.",
    stack: [
      "React Native",
      "Subscription (transparent, easy-cancel)",
      "Email/bank parsing (Plaid-style)",
      "Local-first storage",
      "Push for renewal warnings",
    ],
    copy: ["Trust-first onboarding", "Concrete savings number", "One-tap cancel", "Renewal alerts"],
    avoid: ["Dark-pattern paywall", "Hard-to-cancel irony", "Over-permissioned data asks"],
    brief: {
      targetUser: "People who suspect they're paying for forgotten subscriptions",
      mvp: ["Connect email/bank", "Detected subs list", "Cancel/snooze", "Savings tally"],
      screens: ["Connect", "Subscriptions", "Detail", "Savings", "Paywall"],
      coreLoop: "Connect → see waste → cancel → see savings → return monthly",
      dataModel: ["User", "Subscription(merchant, amount, cycle)", "Savings"],
      monetizationPlan: "Free scan → sub for auto-monitoring + alerts",
      risks: ["Data-access trust", "Cancellation reliability", "Bank API coverage"],
    },
  },
  Productivity: {
    category: "Productivity",
    title: "ADHD Day-Shaper",
    oneLiner: "ADHD-friendly framing is the surge under the productivity churn.",
    confidence: 71,
    difficulty: "Medium",
    freshness: "Rising — last 45 days",
    monetization: "Medium",
    whyNow:
      "Generic planners churn; apps that reframe planning for ADHD brains (visual time, body-doubling, tiny steps) retain better. The opportunity is emotional framing, not features.",
    reasons: [
      "ADHD-framing surge across rising apps",
      "Weak retention loops in incumbents",
      "Reviews: 'overwhelming', 'too many features'",
      "Keyword: 'adhd planner', 'body doubling'",
    ],
    wedge:
      "A day-shaper that turns a messy brain-dump into a gentle, visual timeline with one next-action always in focus.",
    stack: [
      "React Native",
      "Subscription",
      "Local notifications + Live Activity",
      "Optional voice capture",
    ],
    copy: ["Tiny-step framing", "One next action", "Visual time", "Gentle tone"],
    avoid: ["Feature bloat", "Guilt mechanics", "Complex setup"],
    brief: {
      targetUser: "Adults with ADHD who bounce off conventional planners",
      mvp: ["Brain-dump capture", "Auto visual timeline", "Now-card", "Gentle nudges"],
      screens: ["Capture", "Timeline", "Now", "Reflect", "Paywall"],
      coreLoop: "Dump → shape → focus on now → finish → reflect",
      dataModel: ["User", "Task(step, when, done)", "Day"],
      monetizationPlan: "Free core → sub for unlimited days + voice",
      risks: ["Sensitive audience tone", "Retention", "Scope discipline"],
    },
  },
  Finance: {
    category: "Finance",
    title: "Bill-Negotiation Vault",
    oneLiner: "Bill-negotiation heat + receipt/warranty gaps = a trust-wedge in finance.",
    confidence: 69,
    difficulty: "Medium",
    freshness: "Hot — last 21 days",
    monetization: "Medium",
    whyNow:
      "Money-saving utilities are getting strong reviews, but trust friction is the gate. A narrow, transparent 'lower this bill / track this warranty' tool wins on credibility.",
    reasons: [
      "Bill-negotiation reviews climbing",
      "Trust-gate friction in incumbents",
      "Keyword: 'lower my bill', 'warranty tracker'",
    ],
    wedge:
      "A vault that captures bills + receipts and surfaces 'this is negotiable / under warranty / about to renew' nudges.",
    stack: ["React Native", "Subscription", "OCR + email parse", "Push reminders"],
    copy: ["Concrete savings", "Transparent fees", "Narrow scope"],
    avoid: ["Opaque success-fee model", "Over-broad finance dashboard"],
    brief: {
      targetUser: "Households wanting to cut recurring costs without spreadsheets",
      mvp: ["Snap bill/receipt", "Negotiable/renewal flags", "Reminder", "Savings tally"],
      screens: ["Capture", "Vault", "Flags", "Savings", "Paywall"],
      coreLoop: "Capture → get flagged opportunity → act → save → return",
      dataModel: ["User", "Document(type, vendor, amount, date)", "Flag"],
      monetizationPlan: "Free vault → sub for monitoring + negotiation help",
      risks: ["OCR accuracy", "Trust", "Vendor coverage"],
    },
  },
  AI: {
    category: "AI",
    title: "On-Device Voice Agent",
    oneLiner: "Companion vs agent is splitting — the agent side has weaker, churny incumbents.",
    confidence: 73,
    difficulty: "High",
    freshness: "Hot — last 14 days",
    monetization: "High",
    whyNow:
      "AI companions retain on emotion; agents retain on utility. The agent lane has high churn and thin UX — a fast, private, voice-first 'do things for me' agent has room.",
    reasons: [
      "21 rising AI apps, companion/agent split",
      "High churn on utility-agent side",
      "Keyword: 'voice assistant', 'ai agent'",
      "On-device privacy framing emerging",
    ],
    wedge:
      "A voice-first agent that turns spoken intent into done tasks (notes, reminders, messages, summaries) — fast and private.",
    stack: [
      "Native (on-device STT/TTS)",
      "Subscription",
      "Local intent routing + tool calls",
      "Background permissions",
    ],
    copy: ["Voice-first", "Speed", "Privacy framing", "Few high-value actions"],
    avoid: ["Open-ended chatbot", "Slow round-trips", "Permission overload"],
    brief: {
      targetUser: "Power users who want hands-free quick actions, privately",
      mvp: ["Hold-to-talk", "3 killer actions", "Confirm + undo", "Sub paywall"],
      screens: ["Talk", "Result", "History", "Settings", "Paywall"],
      coreLoop: "Speak → action done → confirm → trust grows → daily use",
      dataModel: ["User", "Action(intent, payload, status)", "History"],
      monetizationPlan: "Free daily actions → sub for unlimited + premium tools",
      risks: ["On-device model limits", "Action reliability", "Permissions trust"],
    },
  },
};

export function appsByCategory(cat: string): App[] {
  return cat === "All" ? APPS : APPS.filter((a) => a.category === cat);
}

export function ideaForCategory(cat: string): Idea | undefined {
  return IDEAS[cat];
}

export function appBySlug(slug: string): App | undefined {
  return APPS.find((a) => a.slug === slug);
}

// homepage rows (skip "All"), with alternating scroll direction
export const PULSE_ROWS = Object.keys(IDEAS).map((cat, i) => ({
  category: cat,
  tagline: PULSE_TAGLINE[cat] ?? cat,
  pulse: CATEGORY_PULSE[cat] ?? "",
  apps: APPS.filter((a) => a.category === cat),
  direction: i % 2 === 0 ? ("ltr" as const) : ("rtl" as const),
}));
