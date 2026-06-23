/**
 * `BuildContextManager` — the file-backed implementation of the four verbs plus
 * the supporting capabilities other tools lean on (decisions log, market lock,
 * exports, global preferences).
 *
 * Verb → method:
 *   create_build_context        → create()
 *   update_build_context        → update()   (merges; never blanks unset fields)
 *   get_build_context           → get()      (compact digest by default)
 *   advise_next_build_decision  → adviseNextBuildDecision()
 *
 * Files are the source of truth. `context.json` is written atomically and
 * `memory.md` re-rendered on every mutation; `decisions.jsonl` is append-only.
 */
import { missing, observed } from "@kittie/core";
import type { DecisionPacket, Provenanced, Store } from "@kittie/types";
import type { Clock, IdGen } from "./clock.js";
import { systemClock, uuidGen } from "./clock.js";
import {
  appendJsonl,
  fileExists,
  readJson,
  readJsonl,
  readText,
  writeJsonAtomic,
  writeTextAtomic,
} from "./io.js";
import { evaluateLock, type LockEvalOptions } from "./lock.js";
import { adviseNextBuildDecision } from "./advise.js";
import { renderBuildPlanMarkdown, renderMemoryMarkdown } from "./render.js";
import { resolvePaths, type BuildContextPaths, type ResolvePathsOptions } from "./paths.js";
import {
  SCHEMA_VERSION,
  type BuildContext,
  type BuildContextDigest,
  type BuildPhase,
  type DecisionRecord,
  type DemandCandidate,
  type GlobalPreferenceFile,
  type LaunchPlan,
  type LockState,
  type MarketLock,
  type NewPreference,
  type Preference,
  type ProfileField,
  type ProfileFieldSummary,
  type ProjectProfile,
  type Unknown,
} from "./types.js";

const PROFILE_FIELDS: readonly ProfileField[] = [
  "idea",
  "audience",
  "platforms",
  "markets",
  "monetisation",
  "constraints",
  "competitors",
] as const;

export class BuildContextExistsError extends Error {
  constructor(public readonly contextFile: string) {
    super(`A Build Context already exists at ${contextFile}`);
    this.name = "BuildContextExistsError";
  }
}

export class BuildContextNotFoundError extends Error {
  constructor(public readonly contextFile: string) {
    super(`No Build Context at ${contextFile} — call create() first`);
    this.name = "BuildContextNotFoundError";
  }
}

/** User-asserted profile values (wrapped as `observed`, source `"user"`). */
export interface ProfileUserValues {
  idea: string;
  audience: string;
  platforms: Store[];
  markets: string[];
  monetisation: string;
  constraints: string[];
  competitors: string[];
}

export interface CreateInput {
  contextId?: string;
  phase?: BuildPhase;
  profile?: Partial<ProfileUserValues>;
  preferences?: NewPreference[];
  unknowns?: string[];
}

export interface UpdatePatch {
  phase?: BuildPhase;
  /** User-asserted values; wrapped as `observed` with source `"user"`. */
  profile?: Partial<ProfileUserValues>;
  /** Data-backed values the caller already wrapped in `Provenanced<T>`. */
  profileProvenanced?: Partial<ProjectProfile>;
  addPreferences?: NewPreference[];
  removePreferenceIds?: string[];
  addUnknowns?: string[];
  resolveUnknownIds?: string[];
}

export interface GetOptions {
  include?: Array<"decisions" | "full">;
  recentDecisionLimit?: number;
}

export interface BuildContextManagerOptions extends ResolvePathsOptions {
  clock?: Clock;
  idGen?: IdGen;
}

export class BuildContextManager {
  readonly paths: BuildContextPaths;
  private readonly clock: Clock;
  private readonly idGen: IdGen;

  constructor(opts: BuildContextManagerOptions = {}) {
    this.paths = resolvePaths(opts);
    this.clock = opts.clock ?? systemClock;
    this.idGen = opts.idGen ?? uuidGen;
  }

  exists(): boolean {
    return fileExists(this.paths.contextFile);
  }

  /** create_build_context */
  create(input: CreateInput = {}): BuildContext {
    if (this.exists()) throw new BuildContextExistsError(this.paths.contextFile);
    const now = this.now();
    const profile = emptyProfile();
    if (input.profile) this.applyUserProfile(profile, input.profile, now);
    const ctx: BuildContext = {
      schemaVersion: SCHEMA_VERSION,
      contextId: input.contextId ?? this.idGen(),
      createdAt: now,
      updatedAt: now,
      phase: input.phase ?? "ideation",
      profile,
      preferences: (input.preferences ?? []).map((p) => this.newPreference(p, "project", now)),
      unknowns: (input.unknowns ?? []).map((q) => this.newUnknown(q, null, now)),
    };
    this.persist(ctx);
    return ctx;
  }

  /** Raw persisted context (throws if absent). */
  read(): BuildContext {
    const ctx = readJson<BuildContext>(this.paths.contextFile);
    if (!ctx) throw new BuildContextNotFoundError(this.paths.contextFile);
    return ctx;
  }

  /** update_build_context — merges the patch; never blanks unspecified fields. */
  update(patch: UpdatePatch): BuildContext {
    const ctx = this.read();
    const now = this.now();

    if (patch.phase) ctx.phase = patch.phase;
    if (patch.profile) this.applyUserProfile(ctx.profile, patch.profile, now);
    if (patch.profileProvenanced) {
      const prof = ctx.profile as unknown as Record<ProfileField, Provenanced<unknown>>;
      for (const field of PROFILE_FIELDS) {
        const value = patch.profileProvenanced[field];
        if (value) prof[field] = value;
      }
    }
    if (patch.removePreferenceIds?.length) {
      const drop = new Set(patch.removePreferenceIds);
      ctx.preferences = ctx.preferences.filter((p) => !drop.has(p.id));
    }
    if (patch.addPreferences?.length) {
      for (const p of patch.addPreferences) {
        ctx.preferences.push(this.newPreference(p, "project", now));
      }
    }
    if (patch.resolveUnknownIds?.length) {
      const done = new Set(patch.resolveUnknownIds);
      ctx.unknowns = ctx.unknowns.filter((u) => !done.has(u.id));
    }
    if (patch.addUnknowns?.length) {
      for (const q of patch.addUnknowns) ctx.unknowns.push(this.newUnknown(q, null, now));
    }

    ctx.updatedAt = now;
    this.persist(ctx);
    return ctx;
  }

  /** get_build_context — compact digest by default. */
  get(opts: GetOptions = {}): BuildContextDigest {
    const ctx = this.read();
    const decisions = this.decisions();
    const limit = opts.recentDecisionLimit ?? 5;
    const digest: BuildContextDigest = {
      contextId: ctx.contextId,
      phase: ctx.phase,
      updatedAt: ctx.updatedAt,
      profile: PROFILE_FIELDS.map((field) => summarizeField(field, ctx.profile[field])),
      preferences: this.mergedPreferences(ctx),
      openUnknowns: ctx.unknowns,
      recentDecisions: decisions.slice(-limit),
    };
    if (opts.include?.includes("decisions")) digest.decisions = decisions;
    if (opts.include?.includes("full")) digest.context = ctx;
    return digest;
  }

  /** advise_next_build_decision — ranks the injected demand signal by preferences. */
  adviseNextBuildDecision(
    candidates: DemandCandidate[],
    opts: { snapshotId?: string } = {},
  ): DecisionPacket {
    const ctx = this.read();
    return adviseNextBuildDecision(ctx, this.mergedPreferences(ctx), candidates, {
      now: this.clock(),
      snapshotId: opts.snapshotId,
    });
  }

  // ---- global preferences ----
  globalPreferences(): Preference[] {
    return readJson<GlobalPreferenceFile>(this.paths.globalPrefsFile)?.preferences ?? [];
  }

  addGlobalPreference(p: NewPreference): Preference {
    const now = this.now();
    const pref = this.newPreference(p, "global", now);
    const next: GlobalPreferenceFile = {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now,
      preferences: [...this.globalPreferences(), pref],
    };
    writeJsonAtomic(this.paths.globalPrefsFile, next);
    if (this.exists()) this.renderMemory(this.read());
    return pref;
  }

  // ---- decisions (append-only) ----
  recordDecision(
    packet: DecisionPacket,
    status: DecisionRecord["status"] = "proposed",
  ): DecisionRecord {
    const ctx = this.read();
    const record: DecisionRecord = {
      id: this.idGen(),
      contextId: ctx.contextId,
      status,
      packet,
      recordedAt: this.now(),
    };
    appendJsonl(this.paths.decisionsFile, record);
    return record;
  }

  decisions(): DecisionRecord[] {
    return readJsonl<DecisionRecord>(this.paths.decisionsFile);
  }

  // ---- market lock ----
  writeMarketLock(
    lock: Omit<MarketLock, "schemaVersion" | "lockedAt"> & Partial<Pick<MarketLock, "lockedAt">>,
  ): MarketLock {
    const full: MarketLock = {
      schemaVersion: SCHEMA_VERSION,
      lockedAt: lock.lockedAt ?? this.now(),
      snapshotDate: lock.snapshotDate,
      competitorIds: lock.competitorIds,
      dataSourceVersions: lock.dataSourceVersions,
      scoringModelVersion: lock.scoringModelVersion,
      coverage: lock.coverage,
      toolVersions: lock.toolVersions,
    };
    writeJsonAtomic(this.paths.lockFile, full);
    return full;
  }

  readMarketLock(): MarketLock | null {
    return readJson<MarketLock>(this.paths.lockFile);
  }

  lockState(opts: LockEvalOptions): LockState {
    return evaluateLock(this.readMarketLock(), opts);
  }

  // ---- exports ----
  writeBuildPlan(markdown?: string): string {
    const md = markdown ?? renderBuildPlanMarkdown(this.read());
    writeTextAtomic(this.paths.buildPlanFile, md);
    return md;
  }

  readBuildPlan(): string | null {
    return readText(this.paths.buildPlanFile);
  }

  writeLaunchPlan(
    plan: Omit<LaunchPlan, "schemaVersion" | "updatedAt" | "contextId"> &
      Partial<Pick<LaunchPlan, "contextId">>,
  ): LaunchPlan {
    const full: LaunchPlan = {
      schemaVersion: SCHEMA_VERSION,
      contextId: plan.contextId ?? this.read().contextId,
      steps: plan.steps,
      updatedAt: this.now(),
    };
    writeJsonAtomic(this.paths.launchPlanFile, full);
    return full;
  }

  readLaunchPlan(): LaunchPlan | null {
    return readJson<LaunchPlan>(this.paths.launchPlanFile);
  }

  // ---- internals ----
  private now(): string {
    return new Date(this.clock()).toISOString();
  }

  private mergedPreferences(ctx: BuildContext): Preference[] {
    return [...this.globalPreferences(), ...ctx.preferences];
  }

  private persist(ctx: BuildContext): void {
    writeJsonAtomic(this.paths.contextFile, ctx);
    this.renderMemory(ctx);
  }

  private renderMemory(ctx: BuildContext): void {
    writeTextAtomic(this.paths.memoryFile, renderMemoryMarkdown(ctx, this.mergedPreferences(ctx)));
  }

  private applyUserProfile(
    profile: ProjectProfile,
    values: Partial<ProfileUserValues>,
    now: string,
  ): void {
    const prof = profile as unknown as Record<ProfileField, Provenanced<unknown>>;
    const source = values as Record<string, unknown>;
    for (const field of PROFILE_FIELDS) {
      if (!(field in source)) continue;
      const value = source[field];
      if (value === undefined) continue;
      prof[field] = observed(value, { source: "user", observedAt: now });
    }
  }

  private newPreference(p: NewPreference, scope: Preference["scope"], now: string): Preference {
    return {
      id: this.idGen(),
      text: p.text,
      kind: p.kind,
      scope,
      source: "user",
      createdAt: now,
      updatedAt: now,
    };
  }

  private newUnknown(question: string, field: ProfileField | null, now: string): Unknown {
    return { id: this.idGen(), question, field, createdAt: now };
  }
}

export function createBuildContextManager(
  opts: BuildContextManagerOptions = {},
): BuildContextManager {
  return new BuildContextManager(opts);
}

function emptyProfile(): ProjectProfile {
  return {
    idea: missing<string>("not_attempted"),
    audience: missing<string>("not_attempted"),
    platforms: missing<Store[]>("not_attempted"),
    markets: missing<string[]>("not_attempted"),
    monetisation: missing<string>("not_attempted"),
    constraints: missing<string[]>("not_attempted"),
    competitors: missing<string[]>("not_attempted"),
  };
}

function summarizeField(field: ProfileField, p: Provenanced<unknown>): ProfileFieldSummary {
  const present = p.kind !== "missing" && p.value !== null;
  return {
    field,
    present,
    kind: p.kind,
    coverage: p.coverage,
    source: p.source,
    value: present ? p.value : null,
  };
}
