import { describe, expect, it } from "vitest";

import { parseStoreAppLookupId } from "./db-app-service.js";

describe("parseStoreAppLookupId", () => {
  it("accepts deterministic Apple and Google app ids", () => {
    expect(parseStoreAppLookupId("apple:6446901002")).toEqual({
      store: "apple",
      storeAppId: "6446901002",
    });
    expect(parseStoreAppLookupId("google:com.example.app")).toEqual({
      store: "google",
      storeAppId: "com.example.app",
    });
  });

  it("rejects ids that cannot be resolved through a store lookup", () => {
    expect(parseStoreAppLookupId("6446901002")).toBeNull();
    expect(parseStoreAppLookupId("apple:not-a-number")).toBeNull();
    expect(parseStoreAppLookupId("google:not-a-package")).toBeNull();
    expect(parseStoreAppLookupId("web:com.example.app")).toBeNull();
  });
});
