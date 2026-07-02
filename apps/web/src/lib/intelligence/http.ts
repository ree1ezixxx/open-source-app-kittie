/**
 * Shared honest-error fetch for the #180 intelligence API — used by both the
 * Reports generator and the /ask executor. Unlike `client.ts`'s `tryLive`
 * (which swallows failures into a labelled mock), these surfaces REQUIRE real
 * errors, so a failed request throws.
 */
export const INTEL_BASE = "/api/v1/app-intelligence";

export async function fetchIntel(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${INTEL_BASE}${path}`, { ...init, signal });
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

/** app-detail / compare / validate-idea wrap in `{ data }`; trends is top-level. */
export function unwrapData(body: unknown): unknown {
  return body && typeof body === "object" && "data" in (body as object) ? (body as { data: unknown }).data : body;
}
