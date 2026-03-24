import type { GeneratedImage, ImageGenerateParams, ImageProvider } from "../types.js";
import { aspectRatioToDimensions, GenerationError } from "../utils.js";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

/**
 * Models that accept `input_image` (single URL string) for image-to-image.
 * All others use `image_input` (array of URLs).
 */
const SINGLE_IMAGE_INPUT_MODELS = new Set([
  "black-forest-labs/flux-kontext-pro",
  "black-forest-labs/flux-kontext-max",
  "black-forest-labs/flux-1.1-pro",
  "black-forest-labs/flux-pro",
]);

/**
 * Models that don't support any image input.
 */
const TEXT_ONLY_MODELS = new Set([
  "google/imagen-4",
  "google/imagen-3",
  "recraft-ai/recraft-v3",
]);

/**
 * Recraft uses `size` (e.g. "1024x1024") instead of `aspect_ratio`.
 */
const RECRAFT_MODELS = new Set(["recraft-ai/recraft-v3"]);

export class ReplicateImageProvider implements ImageProvider {
  readonly name = "replicate";
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const aspectRatio = params.aspectRatio ?? "1:1";
    const { width, height } = aspectRatioToDimensions(aspectRatio);

    const input: Record<string, unknown> = {
      prompt: params.prompt,
    };

    // Model-specific input format
    if (RECRAFT_MODELS.has(params.model)) {
      input.size = `${width}x${height}`;
    } else {
      input.aspect_ratio = aspectRatio;
    }

    // Image input handling
    if (params.inputImages?.length && !TEXT_ONLY_MODELS.has(params.model)) {
      if (SINGLE_IMAGE_INPUT_MODELS.has(params.model)) {
        input.input_image = params.inputImages[0];
      } else {
        input.image_input = params.inputImages;
      }
    }

    const response = await fetch(
      `${REPLICATE_API_BASE}/models/${params.model}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({ input }),
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

    const data = (await response.json()) as {
      output: string[] | string;
      status: string;
    };
    const outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;

    if (!outputUrl) {
      throw new GenerationError(
        "replicate",
        "no_output",
        "Replicate returned no output URL",
      );
    }

    return { url: outputUrl, mimeType: "image/png", width, height };
  }
}
