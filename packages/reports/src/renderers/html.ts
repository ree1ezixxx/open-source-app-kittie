/**
 * HTML renderer. Self-contained document with minimal inline styling, all values
 * HTML-escaped. Deterministic for golden tests — no injected timestamps.
 */
import type { IntelligenceReportContract } from "@kittie/types";
import type { ReportBlock, ReportDocument } from "../document.js";
import { formatCaveatLine, formatConfidence, formatEvidenceLine } from "./shared.js";

export function renderHtml(
  document: ReportDocument,
  contract: IntelligenceReportContract,
): string {
  const snapshot = contract.evidenceSnapshot;
  const body: string[] = [`<h1>${esc(document.title)}</h1>`];

  if (document.summary) {
    body.push(`<p class="summary">${esc(document.summary)}</p>`);
  }

  for (const section of document.sections) {
    body.push(`<section>`, `<h2>${esc(section.heading)}</h2>`);
    for (const block of section.blocks) body.push(renderBlock(block));
    body.push(`</section>`);
  }

  body.push(`<section>`, `<h2>Confidence</h2>`);
  body.push(`<p>${esc(formatConfidence(snapshot.confidence))}</p>`);
  if (snapshot.confidence.reasons.length > 0) {
    body.push(list(snapshot.confidence.reasons.map(esc)));
  }
  body.push(`</section>`);

  body.push(`<section>`, `<h2>Evidence</h2>`);
  body.push(
    snapshot.evidence.length === 0
      ? `<p class="empty">No evidence recorded.</p>`
      : list(snapshot.evidence.map((e) => esc(formatEvidenceLine(e)))),
  );
  body.push(`</section>`);

  body.push(`<section>`, `<h2>Caveats</h2>`);
  body.push(
    snapshot.caveats.length === 0
      ? `<p class="empty">None.</p>`
      : list(snapshot.caveats.map((c) => esc(formatCaveatLine(c)))),
  );
  body.push(`</section>`);

  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<title>${esc(document.title)}</title>`,
    `<style>${STYLE}</style>`,
    `</head>`,
    `<body>`,
    `<main data-report-id="${esc(contract.reportId)}" data-template="${esc(contract.template)}">`,
    ...body,
    `</main>`,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}

function renderBlock(block: ReportBlock): string {
  switch (block.kind) {
    case "text":
      return `<p>${esc(block.text)}</p>`;
    case "list":
      return list(block.items.map(esc));
    case "keyValue":
      return `<dl>${block.entries
        .map((e) => `<dt>${esc(e.label)}</dt><dd>${esc(e.value)}</dd>`)
        .join("")}</dl>`;
  }
}

function list(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE =
  "body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;max-width:52rem;margin:2rem auto;padding:0 1rem;line-height:1.5}dt{font-weight:600}dd{margin:0 0 .5rem}.summary{opacity:.75}.empty{opacity:.6;font-style:italic}";
