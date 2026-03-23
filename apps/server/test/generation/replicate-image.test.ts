import { describe, expect, it, vi, beforeEach } from "vitest";

import { ReplicateImageProvider } from "../../src/generation/providers/replicate-image.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("ReplicateImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends correct request to Replicate API", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: ["https://replicate.delivery/image.png"],
        status: "succeeded",
      }),
    });

    const provider = new ReplicateImageProvider("rep-token");
    const result = await provider.generate({
      prompt: "a sunset",
      model: "black-forest-labs/flux-schnell",
      aspectRatio: "16:9",
    });

    expect(result.url).toBe("https://replicate.delivery/image.png");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer rep-token",
          Prefer: "wait",
        }),
      }),
    );
  });

  it("throws GenerationError on API failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Invalid model" }),
    });

    const provider = new ReplicateImageProvider("rep-token");
    await expect(
      provider.generate({ prompt: "test", model: "bad/model" }),
    ).rejects.toThrow(/replicate/i);
  });
});
