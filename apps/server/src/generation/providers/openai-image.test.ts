import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenAIImageProvider } from "./openai-image.js";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  edit: vi.fn(),
}));

vi.mock("openai", async (importOriginal) => {
  const original = await importOriginal<typeof import("openai")>();
  return {
    ...original,
    default: class {
      images = { generate: mocks.generate, edit: mocks.edit };
    },
  };
});

describe("OpenAIImageProvider", () => {
  beforeEach(() => {
    mocks.generate.mockReset();
    mocks.edit.mockReset();
  });

  it("exposes the three direct OpenAI models and returns decodable image data", async () => {
    const png = await sharp({
      create: { width: 32, height: 24, channels: 4, background: "red" },
    })
      .png()
      .toBuffer();
    mocks.generate.mockResolvedValue({
      data: [{ b64_json: png.toString("base64") }],
    });

    const provider = new OpenAIImageProvider("test-key");
    expect(provider.models.map((model) => model.id)).toEqual([
      "openai-official/gpt-image-2.5-sunburst",
      "openai-official/gpt-image-2.5-flare",
      "openai-official/gpt-image-2",
    ]);

    const result = await provider.generate({
      model: "openai-official/gpt-image-2.5-flare",
      prompt: "A red square",
      aspectRatio: "16:9",
      quality: "ultra",
    });
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2.5-flare",
        size: "3840x2160",
        quality: "high",
        output_format: "png",
      }),
    );
    expect(result).toEqual({
      url: `data:image/png;base64,${png.toString("base64")}`,
      mimeType: "image/png",
      width: 32,
      height: 24,
    });
  });

  it("uses the edits endpoint when reference images are supplied", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer();
    mocks.edit.mockResolvedValue({
      data: [{ b64_json: png.toString("base64") }],
    });

    const provider = new OpenAIImageProvider("test-key");
    await provider.generate({
      model: "openai-official/gpt-image-2",
      prompt: "Make it blue",
      quality: "standard",
      inputImages: [`data:image/png;base64,${png.toString("base64")}`],
    });

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2",
        quality: "low",
        size: "1024x1024",
        image: [
          expect.objectContaining({
            name: "reference-0.png",
            type: "image/png",
          }),
        ],
      }),
    );
  });

  it("rejects an unknown model before calling OpenAI", async () => {
    const provider = new OpenAIImageProvider("test-key");
    await expect(
      provider.generate({ model: "openai-official/other", prompt: "test" }),
    ).rejects.toMatchObject({ code: "model_not_found" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
