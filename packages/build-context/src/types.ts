/**
 * Domain types for the Build Context — the persistent, portable project memory
 * a coding-AI keeps about one project it is helping build. See CONTEXT.md for
 * the canonical glossary ("Build Context", "Standing preference", "Market lock",
 * "Build plan").
 *
 * Files are the source of truth (no DB); every substantive project fact is
 * wrapped in `Provenanced<T>` from `@kittie/core`/`@kittie/types` so nothing is
 * ever an untraceable guess.
 */
import type {
  CoverageStatus,
  DecisionPacket,
  Evidence,
  Provenanced,
  Store,
} from "@kittie/types";

export const SCHEMA_VERSION = 1;
export type SchemaVersion = typeof SCHEMA_VERSION;

/** Where a build sits in its lifecycle — drives `advise_next_build_decision`. */
export type BuildPhase =
  | "ideation"
  | "validation"
  | "scoping"
  | "blueprint"
  | "launch"
  | "shipped";

export const BUILD_PHASES: readonly BuildPhase[] = [
  "ideation",
  "validation",
  "scoping",
  "blueprint",
  "launch",
  "shipped",
] as const;

/** Standing preference flavours. `dislike`/`never` exclude; `like`/`always` boost. */
export type PreferenceKind = "like" | "dislike" | "always" | "never" | "stack" | "build";
export type PreferenceScope = "global" | "project";

/**
 * A Standing preference — a durable "always/never" rule or like/dislike the
 * agent honours on every call. Always user-asserted (honest data: preferences
 * come from the user, never invented).
 */
export interface Preference {
  id: string;
  text: string;
  kind: PreferenceKind;
  scope: PreferenceScope;
  source: "user";
  createdAt: string;
  updatedAt: string;
}

/** Input shape for adding a preference (ids/timestamps are assigned for you). */
export interface NewPreference {
  text: string;
  kind: PreferenceKind;
}

/**
 * The project's substantive facts. Each is a `Provenanced<T>`: a value the user
 * stated (`observed`, source `"user"`), market data (`observed`/`modelled`), or
 * `missing` with a coverage reason — never a blank with no explanation.
 */
export interface ProjectProfile {
  idea: Provenanced<string>;
  audience: Provenanced<string>;
  platforms: Provenanced<Store[]>;
  markets: Provenanced<string[]>;
  monetisation: Provenanced<string>;
  constraints: Provenanced<string[]>;
  competitors: Provenanced<string[]>;
}

export type ProfileField = keyof ProjectProfile;

/** An explicit hole in what we know — never silently filled with a guess. */
export interface Unknown {
  id: string;
  question: string;
  field: ProfileField | null;
  createdAt: string;
}

/** The per-project memory, persisted as `.kittie/context.json`. */
export interface BuildContext {
  schemaVersion: SchemaVersion;
  contextId: string;
  createdAt: string;
  updatedAt: string;
  phase: BuildPhase;
  profile: ProjectProfile;
  /** Project-scoped preferences (layered under the user's global ones). */
  preferences: Preference[];
  unknowns: Unknown[];
}

/** The global preference store, persisted as `~/.kittie/preferences.json`. */
export interface GlobalPreferenceFile {
  schemaVersion: SchemaVersion;
  updatedAt: string;
  preferences: Preference[];
}

/**
 * The reproducibility pin for a decision — exactly which live market data a
 * recommendation was based on. Persisted as `.kittie/market.lock.json`.
 */
export interface MarketLock {
  schemaVersion: SchemaVersion;
  /** The market-data snapshot date the decision used (`YYYY-MM-DD`). */
  snapshotDate: string;
  competitorIds: string[];
  /** Data-source id → version, e.g. `{ "apple:rss": "2" }`. */
  dataSourceVersions: Record<string, string>;
  scoringModelVersion: string;
  /** Evidence coverage at lock time. */
  coverage: CoverageStatus;
  /** Tool name → version. */
  toolVersions: Record<string, string>;
  /** ISO-8601 instant the lock was written. */
  lockedAt: string;
}

/** Result of evaluating a Market lock for reuse. */
export type LockState = "fresh" | "stale" | "missing";

/** One appended line of `.kittie/decisions.jsonl` (append-only, never rewritten). */
export interface DecisionRecord {
  id: string;
  contextId: string;
  status: "proposed" | "accepted" | "rejected";
  packet: DecisionPacket;
  recordedAt: string;
}

export interface LaunchStep {
  title: string;
  detail: string;
  done: boolean;
}

/** Exported launch plan, persisted as `.kittie/launch-plan.json`. */
export interface LaunchPlan {
  schemaVersion: SchemaVersion;
  contextId: string;
  steps: LaunchStep[];
  updatedAt: string;
}

/**
 * One trending opportunity to weigh, as produced by the L4 demand signal
 * (`computeDemandSignal`). Injected into `advise_next_build_decision` — this
 * lane never crawls the stores itself.
 */
export interface DemandCandidate {
  id: string;
  label: string;
  /** 0–100 demand score from the L4 demand signal. */
  demandScore: number;
  category?: string | null;
  platform?: Store | null;
  /** Optional backing evidence from the demand engine, passed straight through. */
  evidence?: Evidence[];
  snapshotId?: string | null;
}

/** A compact per-field view returned in the digest (never the raw value blob). */
export interface ProfileFieldSummary {
  field: ProfileField;
  present: boolean;
  kind: Provenanced<unknown>["kind"];
  coverage: CoverageStatus;
  source: string | null;
  value: unknown;
}

/**
 * The small, agent-friendly digest `get_build_context` returns by default —
 * merged preferences + current state, not the full history. Heavy history
 * (`decisions`, raw `context`) is included only on request.
 */
export interface BuildContextDigest {
  contextId: string;
  phase: BuildPhase;
  updatedAt: string;
  profile: ProfileFieldSummary[];
  /** Global + project preferences, merged (global first). */
  preferences: Preference[];
  openUnknowns: Unknown[];
  recentDecisions: DecisionRecord[];
  /** Present only when `include: ["decisions"]`. */
  decisions?: DecisionRecord[];
  /** Present only when `include: ["full"]`. */
  context?: BuildContext;
}
