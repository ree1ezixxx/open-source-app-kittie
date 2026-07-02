/**
 * Runs an Ask plan against the grounded intelligence API and returns the #180
 * envelope's evidence / confidence / caveats plus a one-line answer. No LLM —
 * the "answer" is a deterministic readout of the served envelope. Where a report
 * template exists, `reportHref` deep-links to the Reports surface to render it.
 */
import type {
  IntelligenceCaveat,
  IntelligenceConfidence,
  IntelligenceEvidence,
} from "@kittie/types";
import type { AskIntent, AskPlan } from "./planner";

export interface AskResult {
  intent: AskIntent;
  title: string;
  summary: string;
  confidence: IntelligenceConfidence | null;
  evidence: IntelligenceEvidence[];
  caveats: IntelligenceCaveat[];
  /** Deep link to render the full report, when a template backs this intent. */
  reportHref: string | null;
}

const BASE = "/api/v1/app-intelligence";

async function fetchJson(path: string, init: RequestInit, signal?: AbortSignal): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { ...init, signal });
  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body ? String(body.error) : `Request failed (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return body;
}

/** app-detail / compare / validate-idea wrap in `{ data }`; trends is top-level. */
function unwrap(body: any): any {
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

function envelopeBits(env: any): Pick<AskResult, "confidence" | "evidence" | "caveats"> {
  return {
    confidence: env?.confidence ?? null,
    evidence: Array.isArray(env?.evidence) ? env.evidence : [],
    caveats: Array.isArray(env?.caveats) ? env.caveats : [],
  };
}

export async function runAsk(plan: AskPlan, signal?: AbortSignal): Promise<AskResult> {
  switch (plan.intent) {
    case "app_detail": {
      const env = unwrap(await fetchJson(`/apps/${encodeURIComponent(plan.appId)}`, { method: "GET" }, signal));
      const app = env?.data?.app ?? {};
      return {
        intent: "app_detail",
        title: app.title ?? plan.appId,
        summary: `${app.title ?? plan.appId}${app.developer ? ` — ${app.developer}` : ""}${app.category ? ` · ${app.category}` : ""}`,
        ...envelopeBits(env),
        reportHref: `/reports/app_teardown?appId=${encodeURIComponent(plan.appId)}`,
      };
    }
    case "trends": {
      const qs = new URLSearchParams();
      if (plan.category) qs.set("category", plan.category);
      qs.set("country", plan.country);
      qs.set("growthPeriod", plan.period);
      const env = await fetchJson(`/trends?${qs.toString()}`, { method: "GET" }, signal); // top-level
      const count = Array.isArray(env?.data?.apps) ? env.data.apps.length : 0;
      return {
        intent: "trends",
        title: `Trending — ${plan.category ?? "all categories"} · ${plan.country} · ${plan.period}`,
        summary: count > 0 ? `${count} moving apps.` : "No clean movement for this window.",
        ...envelopeBits(env),
        reportHref: `/reports/category_pulse?${qs.toString().replace("growthPeriod", "period")}`,
      };
    }
    case "compare": {
      const env = unwrap(
        await fetchJson(
          `/compare-apps`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apps: plan.apps.map((a) => (a.includes(":") ? { appId: a } : { query: a })) }) },
          signal,
        ),
      );
      const rows = Array.isArray(env?.data?.rows) ? env.data.rows : [];
      const leader = (env?.data?.insights ?? []).find((i: any) => i?.kind === "leader");
      return {
        intent: "compare",
        title: `Compare — ${rows.map((r: any) => r.title).join(" vs ") || plan.apps.join(" vs ")}`,
        summary: leader?.message ?? `${rows.length} apps compared.`,
        ...envelopeBits(env),
        reportHref: null, // no compare report template yet
      };
    }
    case "validate": {
      const env = unwrap(
        await fetchJson(
          `/validate-idea`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea: plan.idea }) },
          signal,
        ),
      );
      const verdict = env?.data?.verdict ?? "unvalidated";
      return {
        intent: "validate",
        title: `Validate — “${plan.idea}”`,
        summary: `${String(verdict).replace(/_/g, " ")}${env?.data?.verdictReason ? `: ${env.data.verdictReason}` : ""}`,
        ...envelopeBits(env),
        reportHref: `/reports/build_brief?idea=${encodeURIComponent(plan.idea)}`,
      };
    }
    default:
      throw new Error("Unsupported plan cannot be executed.");
  }
}
