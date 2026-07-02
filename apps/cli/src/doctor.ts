/**
 * `doctor` — check that the CLI can reach the configured API. Hits the API's
 * `GET /health` endpoint. `fetchImpl` and `now` are injectable so the check is
 * unit-testable without a live server or real clock.
 */

export interface DoctorReport {
  apiBaseUrl: string;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number }>;

export const DEFAULT_DOCTOR_TIMEOUT_MS = 5000;

export interface RunDoctorOptions {
  apiBaseUrl: string;
  authToken?: string | null;
  fetchImpl?: FetchLike;
  now?: () => number;
  /** Abort the probe after this many ms so a hung API can't hang `doctor`. */
  timeoutMs?: number;
}

export async function runDoctor(options: RunDoctorOptions): Promise<DoctorReport> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? DEFAULT_DOCTOR_TIMEOUT_MS;
  const url = `${options.apiBaseUrl.replace(/\/+$/, "")}/health`;
  const headers: Record<string, string> = {};
  if (options.authToken) headers.Authorization = `Bearer ${options.authToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = now();
  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal });
    return {
      apiBaseUrl: options.apiBaseUrl,
      ok: res.ok,
      status: res.status,
      latencyMs: now() - start,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    const error = controller.signal.aborted
      ? `timed out after ${timeoutMs}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    return { apiBaseUrl: options.apiBaseUrl, ok: false, status: null, latencyMs: now() - start, error };
  } finally {
    clearTimeout(timer);
  }
}

export function formatDoctorHuman(report: DoctorReport): string {
  const lines = [`API base URL: ${report.apiBaseUrl}`];
  if (report.ok) {
    lines.push(`Connectivity: OK (HTTP ${report.status}, ${report.latencyMs}ms)`);
  } else {
    const status = report.status ? ` (HTTP ${report.status})` : "";
    const reason = report.error ? ` — ${report.error}` : "";
    lines.push(`Connectivity: FAILED${status}${reason}`);
    lines.push("Hint: is the API running? Set the origin with `pluto config set api-url <url>` or KITTIE_API_URL.");
  }
  return lines.join("\n");
}
