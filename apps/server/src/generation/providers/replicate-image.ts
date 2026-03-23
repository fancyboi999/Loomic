import type { GeneratedImage, ImageGenerateParams, ImageProvider } from "../types.js";
import { aspectRatioToDimensions, GenerationError } from "../utils.js";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

export class ReplicateImageProvider implements ImageProvider {
  readonly name = "replicate";
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const { width, height } = aspectRatioToDimensions(params.aspectRatio ?? "1:1");

    const body: Record<string, unknown> = {
      input: {
        prompt: params.prompt,
        width,
        height,
        ...(params.inputImages?.length ? { image: params.inputImages[0] } : {}),
      },
    };

    const response = await fetch(
      `${REPLICATE_API_BASE}/models/${params.model}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new GenerationError(
        "replicate",
        "api_error",
        `Replicate API error ${response.status}: ${(errorBody as { detail?: string })?.detail ?? "Unknown error"}`,
      );
    }

    const data = (await response.json()) as { output: string[] | string; status: string };
    const outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;

    if (!outputUrl) {
      throw new GenerationError("replicate", "no_output", "Replicate returned no output URL");
    }

    return { url: outputUrl, mimeType: "image/png", width, height };
  }
}
