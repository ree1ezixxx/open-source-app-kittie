/**
 * Filesystem persistence for reports — the Node-only half of the renderer. Kept
 * out of `render.ts` so the pure render path stays browser-safe (see the
 * package's `./browser` entry). Server/CLI/MCP callers import this via the main
 * `@kittie/reports` entry.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { IntelligenceReportContract, ReportFormat } from "@kittie/types";
import type { ReportTemplateRegistry } from "./registry.js";
import { renderReportContent, reportFileName, type RenderResult } from "./render.js";

/**
 * Render and write a report to `outDir`. Returns the result with `outputPath`
 * populated. The directory (and any parents) is created if missing.
 */
export async function writeReport(
  contract: IntelligenceReportContract,
  format: ReportFormat,
  outDir: string,
  registry?: ReportTemplateRegistry,
): Promise<RenderResult> {
  const result = renderReportContent(contract, format, registry);
  const outputPath = join(outDir, reportFileName(contract.reportId, format));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.content, "utf8");
  return { ...result, outputPath };
}
