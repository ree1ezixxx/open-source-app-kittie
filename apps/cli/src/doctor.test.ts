import { describe, expect, it } from "vitest";
import { formatDoctorHuman, runDoctor, type FetchLike } from "./doctor.js";
import { buildUsage } from "./help.js";

const clock = () => {
  let t = 1000;
  return () => (t += 5);
};

describe("runDoctor", () => {
  it("reports OK when the API health check succeeds", async () => {
    const fetchImpl: FetchLike = async (url) => {
      expect(url).toBe("http://localhost:3009/health");
      return { ok: true, status: 200 };
    };
    const report = await runDoctor({ apiBaseUrl: "http://localhost:3009", fetchImpl, now: clock() });
    expect(report.ok).toBe(true);
    expect(report.status).toBe(200);
    expect(report.latencyMs).toBeGreaterThanOrEqual(0);
    expect(report.error).toBeNull();
  });

  it("strips a trailing slash from the base URL", async () => {
    let seen = "";
    const fetchImpl: FetchLike = async (url) => {
      seen = url;
      return { ok: true, status: 200 };
    };
    await runDoctor({ apiBaseUrl: "http://localhost:3009/", fetchImpl, now: clock() });
    expect(seen).toBe("http://localhost:3009/health");
  });

  it("sends a bearer token when configured", async () => {
    let auth: string | undefined;
    const fetchImpl: FetchLike = async (_url, init) => {
      auth = init?.headers?.Authorization;
      return { ok: true, status: 200 };
    };
    await runDoctor({ apiBaseUrl: "http://x", authToken: "secret", fetchImpl, now: clock() });
    expect(auth).toBe("Bearer secret");
  });

  it("reports a non-OK status as failed", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 503 });
    const report = await runDoctor({ apiBaseUrl: "http://x", fetchImpl, now: clock() });
    expect(report.ok).toBe(false);
    expect(report.status).toBe(503);
    expect(report.error).toBe("HTTP 503");
  });

  it("reports a thrown network error as failed", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    const report = await runDoctor({ apiBaseUrl: "http://x", fetchImpl, now: clock() });
    expect(report.ok).toBe(false);
    expect(report.status).toBeNull();
    expect(report.error).toContain("ECONNREFUSED");
  });
});

describe("formatDoctorHuman", () => {
  it("renders a clear OK line", () => {
    const out = formatDoctorHuman({ apiBaseUrl: "http://x", ok: true, status: 200, latencyMs: 12, error: null });
    expect(out).toContain("Connectivity: OK");
    expect(out).toContain("http://x");
  });

  it("renders a clear failure line with a hint", () => {
    const out = formatDoctorHuman({ apiBaseUrl: "http://x", ok: false, status: null, latencyMs: 1, error: "ECONNREFUSED" });
    expect(out).toContain("Connectivity: FAILED");
    expect(out).toContain("ECONNREFUSED");
    expect(out.toLowerCase()).toContain("hint");
  });
});

describe("help text", () => {
  it("documents the foundation commands", () => {
    const usage = buildUsage();
    for (const cmd of ["help", "doctor", "config", "--json"]) {
      expect(usage).toContain(cmd);
    }
  });
});
