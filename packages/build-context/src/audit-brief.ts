import type { AuditReport, BuildBrief, SubScore } from "@kittie/types";

// Build-brief generator (#175). Pure: AuditReport → an agent-ready spec in
// several formats. This is the "clone button" output — a portable handoff to
// Claude Code / Codex / Rork, not a runtime (docs/adr/0012). Deterministic so it
// snapshot-tests cleanly.

const GENERIC_DONT_BUILD = [
  "Broad feature surface before validation",
  "Expensive AI features before the core loop proves out",
  "Overloaded dashboard / settings sprawl",
  "An unclear retention loop",
];

export function generateBuildBrief(report: AuditReport): BuildBrief {
  const topPain = report.painClusters?.[0];
  const wedge =
    topPain?.opportunity ?? `A focused, well-designed ${report.category ?? "consumer"} app with one clear job.`;
  const idea = topPain ? `${topPain.theme} wedge for ${report.category ?? "this category"}` : `${report.appName}-adjacent wedge`;

  const scoreLine = (s: SubScore) =>
    `- ${s.label}: ${s.value == null ? "—" : s.value}${s.value == null ? " (no data)" : "/100"}${s.note ? ` — ${s.note}` : ""}`;

  const whyNow = report.evidence
    .filter((e) => e.sourceStatus !== "unavailable")
    .map((e) => `- ${e.title} — ${e.detail}`);

  const painLines = (report.painClusters ?? []).slice(0, 5).map(
    (p) => `- **${p.theme}** (${p.frequency} reviews): ${p.opportunity}`,
  );

  const doNotBuild = [...GENERIC_DONT_BUILD];

  const mvp = [
    "One narrow core loop, demoable in a single screen",
    topPain ? `Directly resolve: ${topPain.theme.toLowerCase()}` : "Resolve the single sharpest user complaint",
    "A clear, fair monetisation moment (no dark patterns)",
    "Fast onboarding → first value in under a minute",
  ];

  const markdown = [
    `# Build brief — ${idea}`,
    ``,
    `**Source app audited:** ${report.appName} (${report.category ?? "uncategorised"})`,
    `**Confidence:** ${report.confidence.label} (${Math.round(report.confidence.value * 100)}%) — ${report.confidence.reasons.join("; ")}`,
    ``,
    `## Buildable wedge`,
    wedge,
    ``,
    `## Why now`,
    ...(whyNow.length ? whyNow : ["- (limited evidence — confirm before committing)"]),
    ``,
    `## Scores`,
    ...report.scores.map(scoreLine),
    ``,
    ...(painLines.length ? [`## User pain to exploit`, ...painLines, ``] : []),
    `## MVP scope`,
    ...mvp.map((m) => `- ${m}`),
    ``,
    `## Do NOT build`,
    ...doNotBuild.map((d) => `- ${d}`),
    ``,
    `_Estimates are modelled, not ground truth. Generated ${report.generatedAt}._`,
  ].join("\n");

  const githubIssues = [
    `## Issues — ${idea}`,
    `- [ ] Tracer: core loop end-to-end (one screen) resolving "${topPain?.theme ?? "the core job"}"`,
    `- [ ] Onboarding → first value < 60s`,
    `- [ ] Monetisation moment (transparent paywall / IAP)`,
    `- [ ] Instrument retention loop`,
    ...painLines.map((_, i) => `- [ ] Address pain cluster #${i + 1}: ${(report.painClusters ?? [])[i]?.theme}`),
  ].join("\n");

  const promptCore = [
    `Build an MVP mobile app: ${wedge}`,
    `Context: audited "${report.appName}" (${report.category ?? "n/a"}); audit confidence ${report.confidence.label}.`,
    painLines.length ? `Top user pain to solve: ${(report.painClusters ?? [])[0]?.theme} — ${(report.painClusters ?? [])[0]?.opportunity}` : ``,
    `MVP: ${mvp.join("; ")}.`,
    `Do NOT: ${doNotBuild.join("; ")}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const claudeCodePrompt = `You are Claude Code. ${promptCore}\nStart by scaffolding the single core-loop screen, then wire state, then the monetisation moment. Write tests for the core logic.`;
  const codexPrompt = `${promptCore}\nProduce a runnable Expo/React Native project. Keep scope to the MVP above.`;
  const rorkPrompt = `${promptCore}\nGenerate this as a mobile app with a clean, minimal UI and the core loop on the home screen.`;

  const mcpCall = `kittie.generate_build_brief({ app: ${JSON.stringify(report.appId)}, format: "markdown" })`;

  const json = JSON.stringify(
    {
      idea,
      sourceApp: report.appName,
      category: report.category,
      wedge,
      confidence: report.confidence,
      scores: report.scores.map((s) => ({ name: s.name, value: s.value, sourceStatus: s.sourceStatus })),
      painClusters: report.painClusters ?? [],
      mvp,
      doNotBuild,
      generatedAt: report.generatedAt,
    },
    null,
    2,
  );

  return { idea, markdown, githubIssues, claudeCodePrompt, codexPrompt, rorkPrompt, mcpCall, json, doNotBuild };
}
