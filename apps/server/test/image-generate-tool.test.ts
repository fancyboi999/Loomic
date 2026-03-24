import { describe, expect, it, beforeEach } from "vitest";

import type { ImageProvider } from "../src/generation/types.js";
import { registerImageProvider, clearProviders } from "../src/generation/providers/registry.js";
import { runImageGenerate } from "../src/agent/tools/image-generate.js";

describe("generate_image tool", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("returns structured result on success", async () => {
    const mockProvider: ImageProvider = {
      name: "replicate",
      generate: async () => ({
        url: "https://example.com/img.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
      }),
    };
    registerImageProvider(mockProvider);

    const result = await runImageGenerate({
      prompt: "a cat",
      model: "google/nano-banana-pro",
      aspectRatio: "1:1",
    });

    expect(result.summary).toContain("Generated image");
    expect(result.imageUrl).toBe("https://example.com/img.png");
    expect(result.width).toBe(1024);
  });

  it("returns error message on generation failure", async () => {
    const mockProvider: ImageProvider = {
      name: "replicate",
      generate: async () => { throw new Error("API down"); },
    };
    registerImageProvider(mockProvider);

    const result = await runImageGenerate({
      prompt: "test",
      model: "google/nano-banana-pro",
      aspectRatio: "1:1",
    });

    expect(result.summary).toContain("failed");
    expect(result.error).toBe("API down");
  });
});
