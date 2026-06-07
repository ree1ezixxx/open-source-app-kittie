/**
 * Hot app ideas — mock dataset + query helper.
 *
 * INTEGRATION POINT (#3 of 3, see lib/aiService.ts):
 * In production these are AI-generated concepts derived from fast-growing Apps
 * (Snapshots + review mining). Until that pipeline exists, the Hot Ideas page is
 * backed by this static sample set. The query shape mirrors what a real
 * `/api/v1/ideas` endpoint would accept, so swapping the impl is a one-file change.
 */

export type BlueprintTag = "backend" | "database" | "ai";

export interface AppIdea {
  id: string;
  title: string;
  description: string;
  /** App-Store category of the source App this idea was mined from. */
  sourceCategory: string;
  /** What kind of product the idea itself is. */
  ideaCategory: string;
  reviews: number;
  rating: number;
  createdAt: string; // ISO date
  blueprint: BlueprintTag[];
}

export interface IdeasQuery {
  search?: string;
  sourceCategory?: string;
  ideaCategory?: string;
  blueprint?: BlueprintTag[];
  sort?: "created" | "reviews" | "rating";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface IdeasPage {
  ideas: AppIdea[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const IDEAS: AppIdea[] = [
  { id: "idea-001", title: "AI Receipt-to-Expense Scanner", description: "Snap a receipt and the app categorises every line item, reconciles it against linked cards, and exports a tax-ready ledger. Mined from a fast-rising finance tracker hitting limits on manual entry.", sourceCategory: "Finance", ideaCategory: "AI Tool", reviews: 4120, rating: 4.6, createdAt: "2026-06-05", blueprint: ["backend", "database", "ai"] },
  { id: "idea-002", title: "Sober Streak Companion", description: "A gentle daily check-in that pairs a journaling prompt with a craving-forecast based on past entries. Surfaced from an addiction-recovery app with explosive 30-day review velocity.", sourceCategory: "Health & Fitness", ideaCategory: "Wellness", reviews: 2890, rating: 4.8, createdAt: "2026-06-04", blueprint: ["backend", "database", "ai"] },
  { id: "idea-003", title: "Reverse Recipe from Fridge Photo", description: "Photograph what's in your fridge; get three recipes ranked by how few extra ingredients you'd need. Derived from a food app whose users beg for 'use what I have' in reviews.", sourceCategory: "Food & Drink", ideaCategory: "AI Tool", reviews: 6750, rating: 4.4, createdAt: "2026-06-04", blueprint: ["ai"] },
  { id: "idea-004", title: "Local Tradesperson Instant-Quote", description: "Describe a home job in plain text, attach a photo, and get rough quotes from vetted local tradespeople within the hour. Mined from a home-services app saturated with 'how much will this cost' reviews.", sourceCategory: "Lifestyle", ideaCategory: "Marketplace", reviews: 1980, rating: 4.1, createdAt: "2026-06-03", blueprint: ["backend", "database"] },
  { id: "idea-005", title: "Toddler Sleep-Window Predictor", description: "Logs naps and predicts the next ideal sleep window with a calm-down checklist. Pulled from a baby-tracker climbing fast in parenting charts.", sourceCategory: "Health & Fitness", ideaCategory: "Tracker", reviews: 5300, rating: 4.7, createdAt: "2026-06-03", blueprint: ["backend", "database", "ai"] },
  { id: "idea-006", title: "Podcast-to-Flashcards", description: "Paste a podcast link; get spaced-repetition flashcards of its key claims, auto-tagged by topic. Spotted on an education app whose top request is 'help me remember what I listened to'.", sourceCategory: "Education", ideaCategory: "AI Tool", reviews: 3410, rating: 4.5, createdAt: "2026-06-02", blueprint: ["ai"] },
  { id: "idea-007", title: "Group Trip Cost Splitter with Receipts", description: "Shared trip wallet that OCRs receipts, splits unevenly, and settles up via deep-links to payment apps. Mined from a travel app drowning in 'who paid for what' complaints.", sourceCategory: "Travel", ideaCategory: "Automation", reviews: 2240, rating: 4.3, createdAt: "2026-06-02", blueprint: ["backend", "database", "ai"] },
  { id: "idea-008", title: "Plant Disease Identifier", description: "Photograph a sick houseplant; get a diagnosis, a care plan, and a reminder schedule. Derived from a gardening app with viral review growth around plant health.", sourceCategory: "Lifestyle", ideaCategory: "AI Tool", reviews: 8900, rating: 4.6, createdAt: "2026-06-01", blueprint: ["ai"] },
  { id: "idea-009", title: "Subscription Cancel Concierge", description: "Scans linked email for recurring charges and drafts the cancellation message for each. Surfaced from a budgeting app whose users keep asking 'what am I still paying for'.", sourceCategory: "Finance", ideaCategory: "Automation", reviews: 3120, rating: 4.2, createdAt: "2026-05-31", blueprint: ["backend", "ai"] },
  { id: "idea-010", title: "Form-Check from Gym Mirror Video", description: "Record a lift; get rep-by-rep form feedback overlaid on the video. Mined from a fitness app where 'is my form right' dominates reviews.", sourceCategory: "Health & Fitness", ideaCategory: "AI Tool", reviews: 4670, rating: 4.4, createdAt: "2026-05-30", blueprint: ["ai"] },
  { id: "idea-011", title: "Neighbourhood Tool Library", description: "Borrow and lend drills, ladders, and pressure-washers within a 1km radius with a deposit hold. Pulled from a community app with strong sharing-economy signal.", sourceCategory: "Lifestyle", ideaCategory: "Marketplace", reviews: 1450, rating: 4.0, createdAt: "2026-05-29", blueprint: ["backend", "database"] },
  { id: "idea-012", title: "Meeting-to-Action-Items Bot", description: "Drop a meeting recording; get owners, due dates, and a one-line summary pushed to your task app. Spotted on a productivity app where users request auto-notes.", sourceCategory: "Productivity", ideaCategory: "AI Tool", reviews: 7200, rating: 4.5, createdAt: "2026-05-28", blueprint: ["backend", "ai"] },
  { id: "idea-013", title: "Allergy-Safe Restaurant Finder", description: "Filter nearby menus by your specific allergens, parsed from menu photos diners upload. Mined from a dining app with persistent allergen-safety requests.", sourceCategory: "Food & Drink", ideaCategory: "Social", reviews: 2010, rating: 4.3, createdAt: "2026-05-27", blueprint: ["backend", "database", "ai"] },
  { id: "idea-014", title: "Handwriting-to-Markdown Notes", description: "Scan a page of handwritten notes; get clean Markdown with headings and checkboxes. Derived from a note app where 'digitise my notebook' trends in reviews.", sourceCategory: "Productivity", ideaCategory: "AI Tool", reviews: 5560, rating: 4.6, createdAt: "2026-05-26", blueprint: ["ai"] },
  { id: "idea-015", title: "Used-Car Listing Lie Detector", description: "Paste a listing; cross-checks mileage, price, and photos against market data and flags red-flags. Mined from an auto-marketplace app full of 'is this a scam' reviews.", sourceCategory: "Lifestyle", ideaCategory: "AI Tool", reviews: 1670, rating: 4.1, createdAt: "2026-05-25", blueprint: ["backend", "database", "ai"] },
  { id: "idea-016", title: "Period-Aware Workout Planner", description: "Adapts training intensity to cycle phase with energy-matched sessions. Surfaced from a women's-health app with accelerating review growth.", sourceCategory: "Health & Fitness", ideaCategory: "Wellness", reviews: 6100, rating: 4.7, createdAt: "2026-05-24", blueprint: ["backend", "database"] },
  { id: "idea-017", title: "Kids' Screen-Time Story Reward", description: "Turns earned screen time into chapters of an interactive story, controlled by chores done. Pulled from a parental-controls app with strong gamification demand.", sourceCategory: "Education", ideaCategory: "Content", reviews: 2780, rating: 4.2, createdAt: "2026-05-23", blueprint: ["backend", "database"] },
  { id: "idea-018", title: "Wardrobe Outfit Generator", description: "Photograph your clothes once; get daily outfit suggestions matched to weather and calendar. Mined from a fashion app where users ask 'what should I wear'.", sourceCategory: "Lifestyle", ideaCategory: "AI Tool", reviews: 9400, rating: 4.5, createdAt: "2026-05-22", blueprint: ["ai"] },
  { id: "idea-019", title: "Freelance Invoice Chaser", description: "Auto-sends polite payment reminders on a schedule and tracks who's overdue. Spotted on an invoicing app with 'clients never pay on time' reviews.", sourceCategory: "Business", ideaCategory: "Automation", reviews: 1890, rating: 4.3, createdAt: "2026-05-21", blueprint: ["backend", "database"] },
  { id: "idea-020", title: "Language Practice via Voice Memos", description: "Speak a sentence; get pronunciation scoring and a corrected version read back. Derived from a language app where speaking practice is the top request.", sourceCategory: "Education", ideaCategory: "AI Tool", reviews: 7650, rating: 4.6, createdAt: "2026-05-20", blueprint: ["ai"] },
  { id: "idea-021", title: "Medication Interaction Checker", description: "Scan your prescriptions; get plain-language interaction warnings and a reminder schedule. Mined from a health app with recurring safety-check requests.", sourceCategory: "Health & Fitness", ideaCategory: "Tracker", reviews: 3990, rating: 4.7, createdAt: "2026-05-19", blueprint: ["backend", "database", "ai"] },
  { id: "idea-022", title: "Estate-Sale Resale Estimator", description: "Photograph an item; get a resale price range and the best platform to list it on. Surfaced from a resale app with 'what's this worth' as the dominant review theme.", sourceCategory: "Lifestyle", ideaCategory: "AI Tool", reviews: 2330, rating: 4.2, createdAt: "2026-05-18", blueprint: ["ai"] },
  { id: "idea-023", title: "Commute Carbon + Cost Tracker", description: "Auto-detects trips and shows the money and CO₂ saved by switching modes. Pulled from a transit app with growing sustainability signal.", sourceCategory: "Travel", ideaCategory: "Tracker", reviews: 1540, rating: 4.0, createdAt: "2026-05-17", blueprint: ["backend", "database"] },
  { id: "idea-024", title: "Voice-Note Mood Journal", description: "Ramble for a minute; get a transcribed entry, a mood label, and a weekly emotional arc. Mined from a journaling app with strong ambient-capture demand.", sourceCategory: "Health & Fitness", ideaCategory: "Wellness", reviews: 4480, rating: 4.8, createdAt: "2026-05-16", blueprint: ["backend", "database", "ai"] },
  { id: "idea-025", title: "Small-Business Review Responder", description: "Drafts on-brand replies to new Google/Yelp reviews and flags ones that need a human. Spotted on a local-business app where review management is the top ask.", sourceCategory: "Business", ideaCategory: "AI Tool", reviews: 2660, rating: 4.4, createdAt: "2026-05-15", blueprint: ["backend", "ai"] },
  { id: "idea-026", title: "Pet Symptom Triage", description: "Describe your pet's symptoms; get a vet-or-wait recommendation and a question checklist for the visit. Derived from a pet app with anxious 'should I worry' reviews.", sourceCategory: "Lifestyle", ideaCategory: "AI Tool", reviews: 5120, rating: 4.5, createdAt: "2026-05-14", blueprint: ["ai"] },
  { id: "idea-027", title: "Study-Group Matchmaker", description: "Pairs students in the same course and time zone into accountability pods. Mined from an education app where 'find a study buddy' recurs.", sourceCategory: "Education", ideaCategory: "Social", reviews: 1320, rating: 4.1, createdAt: "2026-05-13", blueprint: ["backend", "database"] },
  { id: "idea-028", title: "Photo Backlog Auto-Album", description: "Clusters your camera roll into shareable albums by event and people, with one-tap cleanup. Surfaced from a photo app where 'organise my mess' dominates.", sourceCategory: "Photo & Video", ideaCategory: "AI Tool", reviews: 8100, rating: 4.4, createdAt: "2026-05-12", blueprint: ["ai"] },
  { id: "idea-029", title: "Rent-Split & Bills Roommate Hub", description: "One place for rent, utilities, and chores with auto-reminders and a fairness ledger. Pulled from a household app full of 'roommates won't pay' reviews.", sourceCategory: "Finance", ideaCategory: "Marketplace", reviews: 2950, rating: 4.3, createdAt: "2026-05-11", blueprint: ["backend", "database"] },
  { id: "idea-030", title: "Live Sports Hype-Clip Maker", description: "Auto-cuts the best 15 seconds of a game you watched into a shareable vertical clip. Mined from a sports app with strong short-form sharing demand.", sourceCategory: "Photo & Video", ideaCategory: "Content", reviews: 3870, rating: 4.2, createdAt: "2026-05-10", blueprint: ["backend", "ai"] },
];

export const SOURCE_CATEGORIES = [...new Set(IDEAS.map((i) => i.sourceCategory))].sort();
export const IDEA_CATEGORIES = [...new Set(IDEAS.map((i) => i.ideaCategory))].sort();

const BLUEPRINT_LABEL: Record<BlueprintTag, string> = {
  backend: "Needs backend",
  database: "Needs database",
  ai: "Needs AI",
};
export function blueprintLabel(tag: BlueprintTag): string {
  return BLUEPRINT_LABEL[tag];
}

/** Pure, synchronous filter/sort/paginate over the static set. */
export function queryIdeas(q: IdeasQuery = {}): IdeasPage {
  const {
    search = "",
    sourceCategory = "",
    ideaCategory = "",
    blueprint = [],
    sort = "created",
    order = "desc",
    page = 1,
    pageSize = 12,
  } = q;

  const needle = search.trim().toLowerCase();
  let rows = IDEAS.filter((i) => {
    if (needle && !(`${i.title} ${i.description}`.toLowerCase().includes(needle))) return false;
    if (sourceCategory && i.sourceCategory !== sourceCategory) return false;
    if (ideaCategory && i.ideaCategory !== ideaCategory) return false;
    if (blueprint.length && !blueprint.every((b) => i.blueprint.includes(b))) return false;
    return true;
  });

  const dir = order === "asc" ? 1 : -1;
  rows = rows.slice().sort((a, b) => {
    if (sort === "reviews") return (a.reviews - b.reviews) * dir;
    if (sort === "rating") return (a.rating - b.rating) * dir;
    return (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) * dir;
  });

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    ideas: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}
