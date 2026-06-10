/* ============================================================
   Additive lane — Assist API client (research chat + Idea→PRD).
   Honesty contract: when the seam is disabled the API says so and
   the UI renders a disabled state — never a faked response.
   ============================================================ */

const BASE = "/api/v1";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      /* keep status message */
    }
    throw new Error(message);
  }
  return ((await res.json()) as { data: T }).data;
}

export interface AssistStatus {
  enabled: boolean;
  model: string | null;
  ideasAvailable: boolean;
}

export async function fetchAssistStatus(signal?: AbortSignal): Promise<AssistStatus> {
  return json(await fetch(`${BASE}/assist/status`, { signal }));
}

export interface ResearchAnswer {
  enabled: boolean;
  answer?: string;
  grounding?: string[];
}

export async function askResearchQuestion(question: string): Promise<ResearchAnswer> {
  return json(
    await fetch(`${BASE}/assist/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    }),
  );
}

export interface IdeaSummary {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  category: string | null;
}

export async function fetchIdeas(
  search?: string,
  signal?: AbortSignal,
): Promise<{ available: boolean; ideas: IdeaSummary[] }> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return json(await fetch(`${BASE}/assist/ideas${q}`, { signal }));
}

export interface PrdResult {
  available: boolean;
  enriched: boolean;
  markdown?: string;
  promptPack?: string;
}

export async function generatePrd(ideaId: string): Promise<PrdResult> {
  return json(
    await fetch(`${BASE}/assist/idea-prd`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ideaId }),
    }),
  );
}
