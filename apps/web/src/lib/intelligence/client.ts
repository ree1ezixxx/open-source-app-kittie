/**
 * App-Intelligence client (Lane C · wired-to-mock).
 *
 * Tries the live endpoint first; on any failure — route not mounted yet, network
 * error, non-2xx, or empty body — falls back to a labelled preview fixture. A
 * mock result is ALWAYS tagged `source: "mock"`, so the UI can say so and never
 * present a fixture as a real market fact. When Lane A (`:3018`) / Lane B
 * (`:3019`) land, point `VITE_API_ORIGIN` at them (or merge to `main`) and the
 * same calls return `source: "live"` with no UI change.
 */
import { mockSimilar, mockTeardown, mockValidate } from "./mocks";
import type { SimilarOutput, TeardownOutput, ValidateOutput } from "./types";

const BASE = "/api/v1/app-intelligence";

async function tryLive<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: T };
    return body?.data ?? null;
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
  const live = await tryLive<ValidateOutput>("/validate", jsonPost({ idea }), signal);
  return live ? { ...live, source: "live" } : mockValidate(idea);
}

export async function findSimilar(query: string, signal?: AbortSignal): Promise<SimilarOutput> {
  const live = await tryLive<SimilarOutput>("/similar", jsonPost({ query }), signal);
  return live ? { ...live, source: "live" } : mockSimilar(query);
}

export async function teardownApp(
  appId: string,
  appName: string,
  signal?: AbortSignal,
): Promise<TeardownOutput> {
  const live = await tryLive<TeardownOutput>(`/teardown/${encodeURIComponent(appId)}`, { method: "GET" }, signal);
  return live ? { ...live, source: "live" } : mockTeardown(appId, appName);
}
