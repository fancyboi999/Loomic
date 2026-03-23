import { describe, expect, it, vi, beforeEach } from "vitest";

import { VolcesVideoProvider } from "../../src/generation/providers/volces-video.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("VolcesVideoProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends video generation request", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ url: "https://volces.example.com/video.mp4" }],
      }),
    });

    const provider = new VolcesVideoProvider("volces-key");
    const result = await provider.generate({
      prompt: "a bird flying",
      model: "doubao-seedance-1-0",
      resolution: "720p",
      duration: 5,
    });

    expect(result.url).toBe("https://volces.example.com/video.mp4");
    expect(result.mimeType).toBe("video/mp4");
    expect(result.durationSeconds).toBe(5);
  });

  it("throws GenerationError on failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Internal error" } }),
    });

    const provider = new VolcesVideoProvider("volces-key");
    await expect(
      provider.generate({ prompt: "test", model: "m", duration: 5 }),
    ).rejects.toThrow(/volces/i);
  });
});
