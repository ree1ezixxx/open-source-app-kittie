import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configPath,
  DEFAULT_API_BASE_URL,
  loadStoredConfig,
  resolveConfig,
  saveStoredConfig,
} from "./config.js";

describe("resolveConfig precedence", () => {
  it("defaults to local dev when nothing is set", () => {
    expect(resolveConfig()).toEqual({ apiBaseUrl: DEFAULT_API_BASE_URL, authToken: null });
  });

  it("uses the stored file over the default", () => {
    const cfg = resolveConfig({ stored: { apiBaseUrl: "https://api.example.com", authToken: "t1" } });
    expect(cfg.apiBaseUrl).toBe("https://api.example.com");
    expect(cfg.authToken).toBe("t1");
  });

  it("env overrides the stored file", () => {
    const cfg = resolveConfig({
      env: { KITTIE_API_URL: "https://env.example.com", KITTIE_API_TOKEN: "envtok" },
      stored: { apiBaseUrl: "https://file.example.com", authToken: "filetok" },
    });
    expect(cfg.apiBaseUrl).toBe("https://env.example.com");
    expect(cfg.authToken).toBe("envtok");
  });

  it("CLI overrides win over everything", () => {
    const cfg = resolveConfig({
      env: { KITTIE_API_URL: "https://env.example.com" },
      stored: { apiBaseUrl: "https://file.example.com" },
      overrides: { apiBaseUrl: "https://flag.example.com" },
    });
    expect(cfg.apiBaseUrl).toBe("https://flag.example.com");
  });

  it("treats blank/whitespace values as unset", () => {
    const cfg = resolveConfig({ env: { KITTIE_API_URL: "   " }, stored: { apiBaseUrl: "" } });
    expect(cfg.apiBaseUrl).toBe(DEFAULT_API_BASE_URL);
  });

  it("degrades non-string stored values to the default instead of crashing", () => {
    // e.g. a hand-edited config: { "apiBaseUrl": 3008 }
    const stored = { apiBaseUrl: 3008 } as unknown as { apiBaseUrl?: string };
    expect(() => resolveConfig({ stored })).not.toThrow();
    expect(resolveConfig({ stored }).apiBaseUrl).toBe(DEFAULT_API_BASE_URL);
  });
});

describe("configPath", () => {
  it("honours KITTIE_CONFIG_HOME", () => {
    expect(configPath({ KITTIE_CONFIG_HOME: "/tmp/xyz" })).toBe("/tmp/xyz/.kittie/config.json");
  });
});

describe("stored config round-trip", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kittie-cli-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns {} for a missing file", () => {
    expect(loadStoredConfig(join(dir, "nope.json"))).toEqual({});
  });

  it("saves and reloads", () => {
    const path = join(dir, "config.json");
    saveStoredConfig(path, { apiBaseUrl: "https://api.example.com", authToken: "abc" });
    expect(loadStoredConfig(path)).toEqual({ apiBaseUrl: "https://api.example.com", authToken: "abc" });
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
  });

  it("tolerates a corrupt file", () => {
    const path = join(dir, "config.json");
    writeFileSync(path, "{not json");
    expect(loadStoredConfig(path)).toEqual({});
  });

  it("rejects a JSON array as config", () => {
    const path = join(dir, "config.json");
    writeFileSync(path, "[1,2,3]");
    expect(loadStoredConfig(path)).toEqual({});
  });
});
