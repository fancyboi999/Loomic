import { tool } from "langchain";
import { z } from "zod";

import { generateImage } from "../../generation/image-generation.js";
import {
  getAvailableImageModels,
  resolveImageProviderName,
  type AvailableModel,
} from "../../generation/providers/registry.js";

const DEFAULT_MODEL = "black-forest-labs/flux-kontext-pro";

/**
 * Build the zod schema dynamically from the models available in the registry.
 * Falls back to a plain string field when no providers are registered.
 */
function buildImageGenerateSchema(models: AvailableModel[]) {
  const modelIds = models.map((m) => m.id);
  const defaultModel = modelIds.includes(DEFAULT_MODEL)
    ? DEFAULT_MODEL
    : modelIds[0] ?? DEFAULT_MODEL;

  const modelDescription = models.length
    ? `Model to use. Available:\n${models.map((m) => `- ${m.id}: ${m.displayName} — ${m.description}`).join("\n")}`
    : "Model identifier (no providers currently registered)";

  // z.enum needs [string, ...string[]], but we may have 0 models at test time.
  const modelField =
    modelIds.length >= 1
      ? z
          .enum(modelIds as [string, ...string[]])
          .default(defaultModel as (typeof modelIds)[number])
          .describe(modelDescription)
      : z.string().default(DEFAULT_MODEL).describe(modelDescription);

  return z.object({
    title: z
      .string()
      .min(1)
      .describe(
        "Short descriptive title for the generated image, used as metadata so the image content is understood without re-analysis",
      ),
    prompt: z.string().min(1).describe("Detailed image generation prompt"),
    model: modelField,
    aspectRatio: z
      .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
      .optional()
      .default("1:1")
      .describe("Aspect ratio of the generated image"),
    quality: z
      .enum(["standard", "hd", "ultra"])
      .optional()
      .default("hd")
      .describe(
        "Image quality/resolution level. standard: ~1K fast preview, hd: ~2K production quality (default), ultra: ~4K print quality (not all models support this, will use max available).",
      ),
    outputFormat: z
      .enum(["png", "jpg", "webp"])
      .optional()
      .describe("Output image format. PNG for transparency, JPG for photos, WebP for web."),
    inputImages: z
      .array(z.string())
      .optional()
      .describe(
        "Reference image URLs for editing/transformation. Google models accept up to 14, Flux models accept 1. Imagen 4 and Recraft V3 are text-only.",
      ),
    placementX: z
      .number()
      .optional()
      .describe(
        "Left edge x coordinate on canvas. Use inspect_canvas to determine position.",
      ),
    placementY: z
      .number()
      .optional()
      .describe(
        "Top edge y coordinate on canvas. Use inspect_canvas to determine position.",
      ),
    placementWidth: z
      .number()
      .optional()
      .default(512)
      .describe("Display width on canvas"),
    placementHeight: z
      .number()
      .optional()
      .default(512)
      .describe("Display height on canvas"),
  });
}

type ImageGenerateInput = {
  title: string;
  prompt: string;
  model: string;
  aspectRatio?: string;
  quality?: string;
  outputFormat?: string;
  inputImages?: string[];
  placementX?: number;
  placementY?: number;
  placementWidth?: number;
  placementHeight?: number;
};

type ImageGenerateResult = {
  summary: string;
  title?: string;
  imageUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  error?: string;
  placement?: { x: number; y: number; width: number; height: number };
};

/**
 * Optional function to persist a generated image to OSS.
 * Accepts the ephemeral URL and returns a persistent signed URL.
 */
export type PersistImageFn = (
  sourceUrl: string,
  mimeType: string,
  prompt: string,
) => Promise<string>;

/**
 * Submit an image generation job and wait for it to complete.
 * Returns the final result: signed_url on success, error on failure.
 */
export type SubmitImageJobFn = (input: {
  prompt: string;
  title: string;
  model: string;
  aspectRatio: string;
  inputImages?: string[];
}) => Promise<{
  jobId: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  error?: string;
}>;

export async function runImageGenerate(
  input: ImageGenerateInput,
  persistImage?: PersistImageFn,
  submitImageJob?: SubmitImageJobFn,
): Promise<ImageGenerateResult> {
  // Job mode: submit to PGMQ and wait for worker to complete
  if (submitImageJob) {
    try {
      const jobResult = await submitImageJob({
        prompt: input.prompt,
        title: input.title,
        model: input.model,
        aspectRatio: input.aspectRatio ?? "1:1",
        ...(input.inputImages ? { inputImages: input.inputImages } : {}),
      });

      if (jobResult.error) {
        return {
          summary: `Image generation failed: ${jobResult.error}`,
          error: jobResult.error,
        };
      }

      const result: ImageGenerateResult = {
        summary: `Generated image (${jobResult.width ?? 0}x${jobResult.height ?? 0}) via ${input.model}`,
        title: input.title,
        imageUrl: jobResult.imageUrl ?? "",
        mimeType: jobResult.mimeType ?? "image/png",
        ...(jobResult.width != null ? { width: jobResult.width } : {}),
        ...(jobResult.height != null ? { height: jobResult.height } : {}),
      };
      if (input.placementX != null && input.placementY != null) {
        result.placement = {
          x: input.placementX,
          y: input.placementY,
          width: input.placementWidth ?? 512,
          height: input.placementHeight ?? 512,
        };
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        summary: `Image generation failed: ${message}`,
        error: message,
      };
    }
  }

  // Direct generation: resolve provider from model ID via registry
  try {
    const providerName = resolveImageProviderName(input.model);
    const result = await generateImage(providerName, {
      prompt: input.prompt,
      model: input.model,
      aspectRatio: input.aspectRatio,
      ...(input.quality ? { quality: input.quality as any } : {}),
      ...(input.outputFormat ? { outputFormat: input.outputFormat as any } : {}),
      ...(input.inputImages?.length ? { inputImages: input.inputImages } : {}),
    });

    let imageUrl = result.url;
    if (persistImage) {
      try {
        imageUrl = await persistImage(result.url, result.mimeType, input.prompt);
      } catch {
        // Fall back to ephemeral URL if upload fails
      }
    }

    const directResult: ImageGenerateResult = {
      summary: `Generated image (${result.width}x${result.height}) via ${input.model}`,
      title: input.title,
      imageUrl,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
    };
    if (input.placementX != null && input.placementY != null) {
      directResult.placement = {
        x: input.placementX,
        y: input.placementY,
        width: input.placementWidth ?? 512,
        height: input.placementHeight ?? 512,
      };
    }
    return directResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      summary: `Image generation failed: ${message}`,
      error: message,
    };
  }
}

export function createImageGenerateTool(deps?: {
  persistImage?: PersistImageFn;
  preferredImageModel?: string;
  submitImageJob?: SubmitImageJobFn;
  /** Override for testing — defaults to querying the provider registry. */
  availableModels?: AvailableModel[];
}) {
  const allModels = deps?.availableModels ?? getAvailableImageModels();

  // If user selected a specific model (manual mode), lock schema to only that model
  const preferred = deps?.preferredImageModel
    ? allModels.filter((m) => m.id === deps.preferredImageModel)
    : [];
  const models = preferred.length > 0 ? preferred : allModels;

  const modelSummary = models.length
    ? models.map((m) => `${m.displayName} (${m.id})`).join(", ")
    : "No models available";

  return tool(
    async (input: ImageGenerateInput) => {
      return await runImageGenerate(
        input,
        deps?.persistImage,
        deps?.submitImageJob,
      );
    },
    {
      name: "generate_image",
      description: `Generate an image using AI. Available models: ${modelSummary}. Returns the generated image URL.`,
      schema: buildImageGenerateSchema(models),
    },
  );
}
