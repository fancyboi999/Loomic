import { describe, expect, it, vi, beforeEach } from "vitest";

import { OpenAIImageProvider } from "../../src/generation/providers/openai-image.js";
import type { ImageGenerateParams } from "../../src/generation/types.js";

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    images: { generate: mockCreate },
  })),
}));

describe("OpenAIImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls OpenAI images.generate with correct params", async () => {
    mockCreate.mockResolvedValue({
      data: [{ url: "https://oai.example.com/img.png" }],
    });

    const provider = new OpenAIImageProvider("test-key");
    const params: ImageGenerateParams = {
      prompt: "a cat",
      model: "gpt-image-1",
      aspectRatio: "1:1",
    };

    const result = await provider.generate(params);

    expect(result.url).toBe("https://oai.example.com/img.png");
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });

  it("maps aspect ratio to size string", async () => {
    mockCreate.mockResolvedValue({
      data: [{ url: "https://oai.example.com/img.png" }],
    });

    const provider = new OpenAIImageProvider("test-key");
    await provider.generate({
      prompt: "wide landscape",
      model: "gpt-image-1",
      aspectRatio: "16:9",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x576" }),
    );
  });

  it("throws GenerationError on API failure", async () => {
    mockCreate.mockRejectedValue(new Error("API rate limit"));

    const provider = new OpenAIImageProvider("test-key");
    await expect(
      provider.generate({ prompt: "test", model: "gpt-image-1" }),
    ).rejects.toThrow("API rate limit");
  });
});
