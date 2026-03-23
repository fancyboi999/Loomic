import OpenAI from "openai";

import type { GeneratedImage, ImageGenerateParams, ImageProvider } from "../types.js";
import { aspectRatioToDimensions, GenerationError } from "../utils.js";

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const { width, height } = aspectRatioToDimensions(params.aspectRatio ?? "1:1");
    const size = `${width}x${height}`;

    try {
      const response = await this.client.images.generate({
        model: params.model,
        prompt: params.prompt,
        size: size as "1024x1024",
        n: 1,
      });

      const url = response.data?.[0]?.url;
      if (!url) {
        throw new GenerationError("openai", "no_output", "OpenAI returned no image URL");
      }

      return { url, mimeType: "image/png", width, height };
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
