/**
 * Markdown renderer. Deterministic: every value comes from the contract, so the
 * output is stable enough for golden tests.
 */
import type { IntelligenceReportContract } from "@kittie/types";
import type { ReportBlock, ReportDocument } from "../document.js";
import { formatCaveatLine, formatConfidence, formatEvidenceLine } from "./shared.js";

export function renderMarkdown(
  document: ReportDocument,
  contract: IntelligenceReportContract,
): string {
  const lines: string[] = [`# ${document.title}`, ""];

  if (document.summary) {
    lines.push(`_${document.summary}_`, "");
  }

  for (const section of document.sections) {
    lines.push(`## ${section.heading}`, "");
    for (const block of section.blocks) {
      lines.push(...renderBlock(block), "");
    }
  }

  const snapshot = contract.evidenceSnapshot;

  lines.push("## Confidence", "", formatConfidence(snapshot.confidence), "");
  if (snapshot.confidence.reasons.length > 0) {
    for (const reason of snapshot.confidence.reasons) lines.push(`- ${reason}`);
    lines.push("");
  }

  lines.push("## Evidence", "");
  if (snapshot.evidence.length === 0) {
    lines.push("_No evidence recorded._", "");
  } else {
    for (const evidence of snapshot.evidence) {
      lines.push(`- ${formatEvidenceLine(evidence)}`);
    }
    lines.push("");
  }

  lines.push("## Caveats", "");
  if (snapshot.caveats.length === 0) {
    lines.push("_None._", "");
  } else {
    for (const caveat of snapshot.caveats) lines.push(`- ${formatCaveatLine(caveat)}`);
    lines.push("");
  }

  return lines.join("\n");
}

function renderBlock(block: ReportBlock): string[] {
  switch (block.kind) {
    case "text":
      return [block.text];
    case "list":
      return block.items.map((item) => `- ${item}`);
    case "keyValue":
      return block.entries.map((entry) => `- **${entry.label}:** ${entry.value}`);
  }
}
