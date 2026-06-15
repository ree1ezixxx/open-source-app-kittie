/**
 * The organic-video source — the SINGLE swappable seam between the live
 * pipeline (job → upsert → API → page) and the outside world.
 *
 * There is no public creator/UGC video feed wired today (capability gap, same
 * posture as the dormant Meta Ad Library sync). So `stubOrganicSource` emits
 * representative rows: deterministic per App, so re-ingest is idempotent and
 * the page renders like truth. Swap this one object for a real TikTok/Instagram
 * adapter and nothing downstream changes.
 */

export type OrganicPlatform = "tiktok" | "instagram" | "youtube" | "other";

/** One App to fetch creator videos for. */
export interface OrganicSourceApp {
  id: string;
  title: string;
}

/** A single creator video as returned by a source (pre-persistence). */
export interface OrganicVideoInput {
  appId: string;
  /** Stable per-App index → stable row id across re-runs. */
  ordinal: number;
  /** Creator handle, stored WITH its leading "@" (e.g. "@cecilia.gaming"). */
  creatorHandle: string;
  platform: OrganicPlatform;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  postedAt: Date | null;
}

export interface OrganicSource {
  readonly name: string;
  fetchForApps(apps: OrganicSourceApp[]): Promise<OrganicVideoInput[]>;
}

/* ----------------------- deterministic helpers ----------------------- */

/** FNV-1a string hash → 32-bit unsigned. Stable, no deps. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded PRNG — same seed → same sequence, so a re-run reproduces the feed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

// Reference epoch for postedAt math — FIXED (not "now"), so postedAt is stable
// across runs while lastSeenAt still moves. 2026-06-01.
const POSTED_EPOCH_MS = Date.UTC(2026, 5, 1);
const DAY_MS = 86_400_000;

const PLATFORMS: { platform: OrganicPlatform; weight: number }[] = [
  { platform: "tiktok", weight: 7 },
  { platform: "instagram", weight: 2 },
  { platform: "youtube", weight: 1 },
];

const HANDLE_POOL = [
  "@ugc.taylor", "@cecilia.gaming", "@aippyai", "@dynamowyd", "@get.aippy",
  "@bustarhein", "@lifeaccordingtoeli", "@netflxandchilly", "@aydenjonez",
  "@sammytroll", "@extraordinaryjayy", "@nikki18888", "@ttjason", "@7berry",
  "@dylan.haagsma", "@muzieaden", "@dommyfreshhh", "@matt4k7", "@filterfinder_",
  "@toastyugc1", "@pocketsafar", "@ugcisaiah", "@realcryptojackk", "@cryptocharged",
  "@kaylee_weaver", "@menswearsoph", "@paigeturnerrr", "@skylerclarkk",
  "@itsacretelife", "@thatservelife", "@rockndoc_", "@gamesfplay", "@share_mod",
  "@atcspotter", "@flightdeck365", "@joeyroppo", "@realfeelpurpose", "@mel_schmidtt",
] as const;

const CAPTION_TEMPLATES = [
  "this app changed how I {verb} 🤯 #fyp",
  "honestly obsessed with {app} rn",
  "POV: you finally found {app} 👀",
  "{app} is actually insane, here's why",
  "tried {app} for a week — results below 👇",
  "why is nobody talking about {app}??",
  "rating {app} so you don't have to",
  "3 things I wish I knew before using {app}",
] as const;
const VERBS = ["work", "play", "create", "scroll", "learn", "trade"] as const;

const weightedPlatform = (rng: () => number): OrganicPlatform => {
  const total = PLATFORMS.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (const p of PLATFORMS) {
    if ((r -= p.weight) < 0) return p.platform;
  }
  return "tiktok";
};

/** Slug → an "official-ish" creator handle derived from the App's first word. */
function officialHandle(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14);
  return slug ? `@${slug}.app` : "@official";
}

/* --------------------------- the stub source --------------------------- */

export const stubOrganicSource: OrganicSource = {
  name: "stub",
  async fetchForApps(apps) {
    const out: OrganicVideoInput[] = [];

    for (const app of apps) {
      const seed = hashString(app.id);
      const rng = mulberry32(seed);

      // VIDEOS count spread like truth (1..46), skewed toward the low end.
      const count = 1 + Math.floor(rng() * rng() * 46);

      // Per-App handle subset so creators recur within a card (truth's
      // @atcspotter / @official_vibrary pattern): the App's own handle plus a
      // few from the global pool.
      const subsetSize = 2 + Math.floor(rng() * 6);
      const subset = [officialHandle(app.title)];
      for (let i = 0; i < subsetSize; i++) subset.push(pick(rng, HANDLE_POOL));

      for (let ordinal = 0; ordinal < count; ordinal++) {
        // Bias toward the App's own handle (index 0) to mimic the recurring
        // official account in truth's carousels.
        const handle = rng() < 0.35 ? subset[0] : pick(rng, subset);
        const platform = weightedPlatform(rng);
        const caption = pick(rng, CAPTION_TEMPLATES)
          .replace("{app}", app.title)
          .replace("{verb}", pick(rng, VERBS));
        const videoId = Math.floor(rng() * 1e15).toString();
        const postedAt = new Date(POSTED_EPOCH_MS - Math.floor(rng() * 180) * DAY_MS);
        const base =
          platform === "instagram"
            ? "https://www.instagram.com/reel/"
            : platform === "youtube"
              ? "https://www.youtube.com/shorts/"
              : `https://www.tiktok.com/${handle}/video/`;

        out.push({
          appId: app.id,
          ordinal,
          creatorHandle: handle,
          platform,
          videoUrl: `${base}${videoId}`,
          // Tiles render as gradient + @handle overlay, so no thumbnail asset.
          thumbnailUrl: null,
          caption,
          postedAt,
        });
      }
    }

    return out;
  },
};
