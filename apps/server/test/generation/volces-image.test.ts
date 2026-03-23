import { describe, expect, it, vi, beforeEach } from "vitest";

import { VolcesImageProvider } from "../../src/generation/providers/volces-image.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("VolcesImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends OpenAI-compatible request with dimensions", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ url: "https://volces.example.com/img.png" }],
      }),
    });

    const provider = new VolcesImageProvider("volces-key");
    const result = await provider.generate({
      prompt: "a mountain",
      model: "doubao-seedream-3-0",
      aspectRatio: "4:3",
    });

    expect(result.url).toBe("https://volces.example.com/img.png");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
  });

  it("throws GenerationError on failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Bad request" } }),
    });

    const provider = new VolcesImageProvider("volces-key");
    await expect(
      provider.generate({ prompt: "test", model: "bad-model" }),
    ).rejects.toThrow(/volces/i);
  });
});
