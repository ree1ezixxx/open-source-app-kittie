/**
 * Report generation for the thin `/reports` web surface (#193).
 *
 * There is no report API and no persistence (local-first, per #187/#179), so a
 * report is generated on demand: fetch the source *intelligence* from the API,
 * then render it in-browser with `@kittie/reports/browser` (the fs-free entry).
 * Returns metadata + the rendered content in all three formats.
 */
import {
  buildAppTeardownReport,
  buildBuildBriefReport,
  buildCategoryPulseReport,
  createReportRegistry,
  renderReportContent,
  type TrendsIntelligenceResponse,
} from "@kittie/reports/browser";
import type {
  AppDetailIntelligenceResponse,
  IntelligenceReportContract,
  ValidateIdeaIntelligenceResponse,
} from "@kittie/types";

export type ReportTemplateId = "app_teardown" | "category_pulse" | "build_brief";
export type ReportFormatId = "markdown" | "json" | "html";

export const REPORT_TEMPLATES: readonly ReportTemplateId[] = ["app_teardown", "category_pulse", "build_brief"];

export interface ReportParams {
  appId?: string;
  idea?: string;
  category?: string;
  country?: string;
  period?: string;
}

export interface RenderedFormat {
  content: string;
  contentType: string;
  byteLength: number;
}

export interface GeneratedReport {
  reportId: string;
  template: string;
  title: string;
  generatedAt: string | null;
  formats: Record<ReportFormatId, RenderedFormat>;
}

const BASE = "/api/v1/app-intelligence";
const registry = createReportRegistry();

async function fetchJson(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { ...init, signal });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return body;
}

/** app-detail + validate-idea wrap in `{ data }`; trends is top-level. */
function unwrap(body: unknown): unknown {
  return body && typeof body === "object" && "data" in (body as object) ? (body as { data: unknown }).data : body;
}

async function contractFor(
  template: ReportTemplateId,
  params: ReportParams,
  signal?: AbortSignal,
): Promise<IntelligenceReportContract> {
  switch (template) {
    case "app_teardown": {
      const id = (params.appId ?? "").trim();
      if (!id) throw new Error("An app id is required (e.g. apple:6446901002).");
      const env = unwrap(
        await fetchJson(`/apps/${encodeURIComponent(id)}`, { method: "GET" }, signal),
      ) as AppDetailIntelligenceResponse;
      return buildAppTeardownReport(env);
    }
    case "category_pulse": {
      const qs = new URLSearchParams();
      if (params.category && params.category.trim()) qs.set("category", params.category.trim());
      qs.set("country", params.country?.trim() || "US");
      qs.set("growthPeriod", params.period?.trim() || "7d");
      const env = (await fetchJson(`/trends?${qs.toString()}`, { method: "GET" }, signal)) as TrendsIntelligenceResponse;
      return buildCategoryPulseReport(env);
    }
    case "build_brief": {
      const idea = (params.idea ?? "").trim();
      if (!idea) throw new Error("An app idea is required.");
      const env = unwrap(
        await fetchJson(
          `/validate-idea`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea }) },
          signal,
        ),
      ) as ValidateIdeaIntelligenceResponse;
      return buildBuildBriefReport(env);
    }
    default:
      throw new Error(`Unknown report template: ${String(template)}`);
  }
}

export async function generateReport(
  template: ReportTemplateId,
  params: ReportParams,
  signal?: AbortSignal,
): Promise<GeneratedReport> {
  const contract = await contractFor(template, params, signal);
  const one = (format: ReportFormatId): RenderedFormat => {
    const r = renderReportContent(contract, format, registry);
    return { content: r.content, contentType: r.contentType, byteLength: r.byteLength };
  };
  return {
    reportId: contract.reportId,
    template: contract.template,
    title: contract.outputMetadata.title,
    generatedAt: contract.outputMetadata.generatedAt,
    formats: { markdown: one("markdown"), json: one("json"), html: one("html") },
  };
}
