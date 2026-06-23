/**
 * Human-readable renders. `memory.md` is regenerated from `context.json` on
 * every write — it is a view, not a source of truth, so it can never drift from
 * the machine state. `build-plan.md` is the user-facing Build plan export.
 */
import { isPresent } from "@kittie/core";
import type { Provenanced } from "@kittie/types";
import type { BuildContext, Preference, ProfileField } from "./types.js";

const FIELD_LABELS: Record<ProfileField, string> = {
  idea: "Idea",
  audience: "Audience",
  platforms: "Platforms",
  markets: "Markets",
  monetisation: "Monetisation",
  constraints: "Constraints",
  competitors: "Competitors",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS) as ProfileField[];

function formatValue(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function renderMemoryMarkdown(ctx: BuildContext, mergedPreferences: Preference[]): string {
  const lines: string[] = [
    `# Project memory — ${ctx.contextId}`,
    "",
    "_Auto-generated from `context.json`. Do not hand-edit — changes flow through the build-context tools._",
    "",
    `**Phase:** ${ctx.phase}`,
    "",
    "## What we know",
  ];

  let known = 0;
  for (const field of FIELD_ORDER) {
    const p: Provenanced<unknown> = ctx.profile[field];
    if (isPresent(p)) {
      known += 1;
      const origin = p.kind === "observed" && p.source === "user" ? "you" : p.kind;
      lines.push(`- **${FIELD_LABELS[field]}:** ${formatValue(p.value)} _(${origin})_`);
    }
  }
  if (known === 0) lines.push("- _Nothing recorded yet._");

  lines.push("", "## Standing preferences");
  if (mergedPreferences.length === 0) {
    lines.push("- _None._");
  } else {
    for (const pref of mergedPreferences) {
      lines.push(`- ${pref.text} _(${pref.kind}, ${pref.scope})_`);
    }
  }

  lines.push("", "## Open unknowns");
  if (ctx.unknowns.length === 0) {
    lines.push("- _None._");
  } else {
    for (const unknown of ctx.unknowns) lines.push(`- ${unknown.question}`);
  }

  lines.push("");
  return lines.join("\n");
}

export function renderBuildPlanMarkdown(ctx: BuildContext): string {
  const idea = ctx.profile.idea;
  const audience = ctx.profile.audience;
  const monetisation = ctx.profile.monetisation;
  return [
    `# Build plan — ${ctx.contextId}`,
    "",
    "## Idea",
    isPresent(idea) ? formatValue(idea.value) : "_TBD_",
    "",
    "## Audience",
    isPresent(audience) ? formatValue(audience.value) : "_TBD_",
    "",
    "## Monetisation",
    isPresent(monetisation) ? formatValue(monetisation.value) : "_TBD_",
    "",
    "## Phase",
    ctx.phase,
    "",
  ].join("\n");
}
