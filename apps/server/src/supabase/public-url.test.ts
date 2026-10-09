import { describe, expect, it } from "vitest";

import { browserStorageUrl } from "./public-url.js";

describe("browserStorageUrl", () => {
  it("uses the browser's Supabase origin while preserving the Storage path and query", () => {
    expect(browserStorageUrl(
      "http://host.docker.internal:54321/storage/v1/object/public/project-assets/image.png?token=abc",
      "http://127.0.0.1:54321",
    )).toBe("http://127.0.0.1:54321/storage/v1/object/public/project-assets/image.png?token=abc");
  });

  it("keeps the SDK URL when no public origin is configured", () => {
    expect(browserStorageUrl("https://example.test/storage/image.png")).toBe("https://example.test/storage/image.png");
  });
});
