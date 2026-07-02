/**
 * JSON renderer. Emits the format-agnostic document alongside the untouched
 * evidence snapshot and output metadata, so downstream consumers get the same
 * evidence/confidence/caveats the human formats show.
 */
import type { IntelligenceReportContract } from "@kittie/types";
import type { ReportDocument } from "../document.js";

export interface RenderedReportJson {
  reportId: string;
  template: string;
  status: string;
  document: ReportDocument;
  evidence: IntelligenceReportContract["evidenceSnapshot"]["evidence"];
  confidence: IntelligenceReportContract["evidenceSnapshot"]["confidence"];
  caveats: IntelligenceReportContract["evidenceSnapshot"]["caveats"];
  metadata: IntelligenceReportContract["outputMetadata"] & { generatedAt: string | null };
}

export function renderJson(
  document: ReportDocument,
  contract: IntelligenceReportContract,
): string {
  const payload: RenderedReportJson = {
    reportId: contract.reportId,
    template: contract.template,
    status: contract.status,
    document,
    evidence: contract.evidenceSnapshot.evidence,
    confidence: contract.evidenceSnapshot.confidence,
    caveats: contract.evidenceSnapshot.caveats,
    metadata: {
      ...contract.outputMetadata,
      generatedAt: contract.outputMetadata.generatedAt,
    },
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}
