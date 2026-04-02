import { describe, expect, it, beforeEach } from "vitest";

import type { ImageProvider } from "../../src/generation/types.js";
import { generateImage } from "../../src/generation/image-generation.js";
import { registerImageProvider, clearProviders } from "../../src/generation/providers/registry.js";

describe("generateImage orchestrator", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("delegates to the named provider", async () => {
    const mockProvider: ImageProvider = {
      name: "mock",
      models: [],
      generate: async () => ({
        url: "https://example.com/img.png",
        mimeType: "image/png",
        width: 512,
        height: 512,
      }),
    };
    registerImageProvider(mockProvider);

    const result = await generateImage("mock", { prompt: "test", model: "m" });
    expect(result.url).toBe("https://example.com/img.png");
  });

  it("throws for unknown provider", async () => {
    await expect(
      generateImage("nope", { prompt: "test", model: "m" }),
    ).rejects.toThrow(/no image provider/i);
  });
});
