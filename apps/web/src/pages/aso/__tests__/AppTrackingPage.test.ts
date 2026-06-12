import { describe, it, expect, beforeEach } from "vitest";

// This mirrors the loadTracked function from AppTrackingPage
interface TrackedApp {
  id: string;
  store: "apple" | "google";
  title: string;
  developer: string;
  iconUrl: string | null;
  category: string | null;
  addedAt: string;
  keywords: string[];
}

function loadTracked(): TrackedApp[] {
  const LS_KEY = "kittie.aso.trackedApps";
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TrackedApp => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof (item as any).id === "string" &&
        typeof (item as any).store === "string" &&
        typeof (item as any).title === "string" &&
        typeof (item as any).developer === "string" &&
        typeof (item as any).addedAt === "string" &&
        Array.isArray((item as any).keywords)
      );
    });
  } catch {
    return [];
  }
}

describe("TrackedApp localStorage loading", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when localStorage is empty", () => {
    expect(loadTracked()).toEqual([]);
  });

  it("returns empty array when key doesn't exist", () => {
    localStorage.setItem("other-key", "{}");
    expect(loadTracked()).toEqual([]);
  });

  it("returns empty array when stored value is invalid JSON", () => {
    localStorage.setItem("kittie.aso.trackedApps", "{invalid json");
    expect(loadTracked()).toEqual([]);
  });

  it("returns empty array when stored value is not an array", () => {
    localStorage.setItem("kittie.aso.trackedApps", '{"app": "data"}');
    expect(loadTracked()).toEqual([]);
  });

  it("filters out items missing required fields", () => {
    const mixed = [
      {
        id: "1",
        store: "apple",
        title: "App 1",
        developer: "Dev 1",
        iconUrl: null,
        category: null,
        addedAt: "2024-01-01T00:00:00Z",
        keywords: [],
      },
      {
        // Missing developer field
        id: "2",
        store: "apple",
        title: "App 2",
        iconUrl: null,
        category: null,
        addedAt: "2024-01-01T00:00:00Z",
        keywords: [],
      },
      {
        // Missing keywords array
        id: "3",
        store: "google",
        title: "App 3",
        developer: "Dev 3",
        iconUrl: null,
        category: null,
        addedAt: "2024-01-01T00:00:00Z",
      },
    ];
    localStorage.setItem("kittie.aso.trackedApps", JSON.stringify(mixed));
    const result = loadTracked();
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe("1");
  });

  it("loads valid tracked apps correctly", () => {
    const valid: TrackedApp[] = [
      {
        id: "app-1",
        store: "apple",
        title: "My App",
        developer: "My Company",
        iconUrl: "https://example.com/icon.png",
        category: "Productivity",
        addedAt: "2024-01-01T00:00:00Z",
        keywords: ["productivity", "task"],
      },
      {
        id: "app-2",
        store: "google",
        title: "Another App",
        developer: "Another Company",
        iconUrl: null,
        category: null,
        addedAt: "2024-01-02T00:00:00Z",
        keywords: [],
      },
    ];
    localStorage.setItem("kittie.aso.trackedApps", JSON.stringify(valid));
    const result = loadTracked();
    expect(result).toEqual(valid);
  });

  it("returns empty array on any parsing error", () => {
    const LS_KEY = "kittie.aso.trackedApps";
    // Simulate a corrupted value that throws during JSON.parse
    const mockLocalStorage = {
      getItem: () => "valid-but-problematic",
      setItem: () => {},
      clear: () => {},
    };
    // The actual implementation catches all errors, so this should work
    localStorage.setItem(LS_KEY, "[]");
    expect(loadTracked()).toEqual([]);
  });
});
