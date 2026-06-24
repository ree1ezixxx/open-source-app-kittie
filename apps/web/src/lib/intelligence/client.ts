/**
 * App-Intelligence client (Lane C).
 *
 * Tries the live endpoint first; on any failure — route not mounted, network
 * error, non-2xx, or empty body — falls back to a labelled preview fixture
 * (`source: "mock"`), so the UI never presents a fixture as a real market fact.
 *
 * Live responses are reconciled to the render types via `adapt.ts`. The served
 * envelope is inconsistent across lanes (Lane A returns the report bare; Lane B
 * wraps in `{ data }`), so `tryLive` accepts both. Endpoints (canonical `:3008`
 * once merged, or `VITE_API_ORIGIN`): `POST /similar`, `POST /validate`,
 * `GET /apps/:id/teardown`.
 */
import { adaptSimilar, adaptTeardown, adaptValidate } from "./adapt";
import { mockSimilar, mockTeardown, mockValidate } from "./mocks";
import type { SimilarOutput, TeardownOutput, ValidateOutput } from "./types";

const BASE = "/api/v1/app-intelligence";

/** Returns the raw served object (envelope-tolerant), or null on any failure. */
async function tryLive(path: string, init: RequestInit, signal?: AbortSignal): Promise<any | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: unknown } | null;
    if (!body) return null;
    return (body as { data?: unknown }).data ?? body; // Lane B wraps in {data}; Lane A is bare
  } catch {
    return null; // route absent / aborted / offline — caller serves a preview
  }
}

const jsonPost = (payload: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export async function validateIdea(idea: string, signal?: AbortSignal): Promise<ValidateOutput> {
  const live = await tryLive("/validate", jsonPost({ idea }), signal);
  return live ? adaptValidate(live, idea) : mockValidate(idea);
}

export async function findSimilar(query: string, signal?: AbortSignal): Promise<SimilarOutput> {
  const live = await tryLive("/similar", jsonPost({ query }), signal);
  return live ? adaptSimilar(live, query) : mockSimilar(query);
}

export async function teardownApp(
  appId: string,
  appName: string,
  signal?: AbortSignal,
): Promise<TeardownOutput> {
  const live = await tryLive(`/apps/${encodeURIComponent(appId)}/teardown`, { method: "GET" }, signal);
  return live ? adaptTeardown(live) : mockTeardown(appId, appName);
}
