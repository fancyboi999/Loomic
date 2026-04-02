import { describe, expect, it, beforeEach } from "vitest";

import type { ImageProvider } from "../../src/generation/types.js";
import {
  registerImageProvider,
  getImageProvider,
  clearProviders,
} from "../../src/generation/providers/registry.js";

describe("Provider registry", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("registers and retrieves an image provider", () => {
    const mockProvider: ImageProvider = {
      name: "test",
      models: [],
      generate: async () => ({ url: "http://x", mimeType: "image/png", width: 100, height: 100 }),
    };
    registerImageProvider(mockProvider);
    expect(getImageProvider("test")).toBe(mockProvider);
  });

  it("throws for unknown provider", () => {
    expect(() => getImageProvider("nope")).toThrow(/no image provider.*nope/i);
  });
});
