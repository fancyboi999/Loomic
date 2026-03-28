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

  it("normalizes aspect ratio for GPT Image (16:9 → 3:2)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: ["https://replicate.delivery/img.png"],
        status: "succeeded",
      }),
    });

    const provider = new ReplicateImageProvider("rep-token");
    await provider.generate({
      prompt: "test",
      model: "openai/gpt-image-1.5",
      aspectRatio: "16:9",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // GPT Image only supports 1:1, 3:2, 2:3 — 16:9 should map to 3:2
    expect(body.input.aspect_ratio).toBe("3:2");
  });

  it("sends input_images for GPT Image model", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: "https://replicate.delivery/img.png",
        status: "succeeded",
      }),
    });

    const provider = new ReplicateImageProvider("rep-token");
    await provider.generate({
      prompt: "edit this",
      model: "openai/gpt-image-1.5",
      inputImages: ["https://example.com/ref.png"],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input.input_images).toEqual(["https://example.com/ref.png"]);
    expect(body.input.image_input).toBeUndefined();
    expect(body.input.input_image).toBeUndefined();
  });

  it("applies quality translation for Seedream", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: ["https://replicate.delivery/img.png"],
        status: "succeeded",
      }),
    });

    const provider = new ReplicateImageProvider("rep-token");
    await provider.generate({
      prompt: "test",
      model: "bytedance/seedream-5-lite",
      quality: "ultra",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input.size).toBe("3K"); // ultra caps at 3K for seedream-5-lite
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
