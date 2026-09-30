import OpenAI, { toFile } from "openai";
import sharp from "sharp";

import type {
  GeneratedImage,
  ImageGenerateParams,
  ImageProvider,
  ModelInfo,
} from "../types.js";
import { GenerationError, fetchAsBase64 } from "../utils.js";

const MODEL_PREFIX = "openai-official/";
const ICON_OPENAI = "https://github.com/openai.png";

const OPENAI_IMAGE_MODELS: readonly ModelInfo[] = [
  {
    id: `${MODEL_PREFIX}gpt-image-2.5-sunburst`,
    displayName: "GPT Image 2.5 Sunburst",
    description:
      "OpenAI's highest-quality image generation and precise multi-image editing.",
    iconUrl: ICON_OPENAI,
  },
  {
    id: `${MODEL_PREFIX}gpt-image-2.5-flare`,
    displayName: "GPT Image 2.5 Flare",
    description: "Fast, high-quality image generation and multi-image editing.",
    iconUrl: ICON_OPENAI,
  },
  {
    id: `${MODEL_PREFIX}gpt-image-2`,
    displayName: "GPT Image 2",
    description: "Image generation and editing with flexible image sizes.",
    iconUrl: ICON_OPENAI,
  },
];

// All sizes are multiples of 16 and stay within the current Image API pixel limits.
const SQUARE_SIZES = ["1024x1024", "2048x2048", "2880x2880"] as const;
const SIZES: Record<string, readonly [string, string, string]> = {
  "1:1": SQUARE_SIZES,
  "16:9": ["1280x720", "2048x1152", "3840x2160"],
  "9:16": ["720x1280", "1152x2048", "2160x3840"],
  "4:3": ["1152x864", "2048x1536", "3200x2400"],
  "3:4": ["864x1152", "1536x2048", "2400x3200"],
};

function imageSize(params: ImageGenerateParams): string {
  const sizes = SIZES[params.aspectRatio ?? "1:1"] ?? SQUARE_SIZES;
  const qualityIndex =
    params.quality === "standard" ? 0 : params.quality === "ultra" ? 2 : 1;
  return sizes[qualityIndex] ?? SQUARE_SIZES[1];
}

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  readonly models = OPENAI_IMAGE_MODELS;
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const model = params.model.startsWith(MODEL_PREFIX)
      ? params.model.slice(MODEL_PREFIX.length)
      : "";
    if (!this.models.some((candidate) => candidate.id === params.model)) {
      throw new GenerationError(
        this.name,
        "model_not_found",
        `Unknown OpenAI image model: ${params.model}`,
      );
    }

    const size = imageSize(params);
    const quality =
      params.quality === "standard"
        ? "low"
        : params.quality === "ultra"
          ? "high"
          : "medium";

    try {
      const request = {
        model,
        prompt: params.prompt,
        // The installed SDK types predate GPT Image 2's flexible size support.
        size: size as "1024x1024",
        quality: quality as "low" | "medium" | "high",
        output_format: "png" as const,
        n: 1,
      };
      const response = params.inputImages?.length
        ? await this.client.images.edit({
            ...request,
            image: await Promise.all(
              params.inputImages.map(async (url, index) => {
                const { data, mimeType } = await fetchAsBase64(this.name, url);
                const extension =
                  mimeType === "image/webp"
                    ? "webp"
                    : mimeType === "image/jpeg"
                      ? "jpg"
                      : "png";
                return toFile(
                  Buffer.from(data, "base64"),
                  `reference-${index}.${extension}`,
                  { type: mimeType },
                );
              }),
            ),
          })
        : await this.client.images.generate(request);

      const base64 = response.data?.[0]?.b64_json;
      if (!base64) {
        throw new GenerationError(
          this.name,
          "no_output",
          "OpenAI returned no image data",
        );
      }
      const metadata = await sharp(Buffer.from(base64, "base64")).metadata();
      if (!metadata.width || !metadata.height) {
        throw new GenerationError(
          this.name,
          "no_output",
          "OpenAI returned image data without dimensions",
        );
      }
      return {
        url: `data:image/png;base64,${base64}`,
        mimeType: "image/png",
        width: metadata.width,
        height: metadata.height,
      };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError(
        "openai",
        "api_error",
        error instanceof Error ? error.message : "Unknown OpenAI error",
      );
    }
  }
}
