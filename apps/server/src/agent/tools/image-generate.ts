import { tool } from "langchain";
import { z } from "zod";

import { generateImage } from "../../generation/image-generation.js";

/**
 * Replicate model IDs available for image generation.
 * Aligned with Lovart's supported model lineup.
 */
export const REPLICATE_IMAGE_MODELS = [
  // Google
  "google/nano-banana-pro",
  "google/nano-banana-2",
  "google/nano-banana",
  "google/imagen-4",
  // Flux (Black Forest Labs)
  "black-forest-labs/flux-kontext-max",
  "black-forest-labs/flux-kontext-pro",
  // Bytedance
  "bytedance/seedream-5-lite",
  "bytedance/seedream-4.5",
  "bytedance/seedream-4",
  // Recraft
  "recraft-ai/recraft-v3",
] as const;

const imageGenerateSchema = z.object({
  title: z.string().min(1).describe("Short descriptive title for the generated image, used as metadata so the image content is understood without re-analysis"),
  prompt: z.string().min(1).describe("Detailed image generation prompt"),
  model: z
    .enum(REPLICATE_IMAGE_MODELS)
    .default("black-forest-labs/flux-kontext-pro")
    .describe("Replicate model to use for generation"),
  aspectRatio: z
    .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
    .optional()
    .default("1:1")
    .describe("Aspect ratio of the generated image"),
  inputImages: z
    .array(z.string())
    .optional()
    .describe(
      "Reference image URLs for editing/transformation. Google models accept up to 14, Flux models accept 1.",
    ),
});

type ImageGenerateInput = z.infer<typeof imageGenerateSchema>;

type ImageGenerateResult = {
  summary: string;
  title?: string;
  imageUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  error?: string;
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

export async function runImageGenerate(
  input: ImageGenerateInput,
  persistImage?: PersistImageFn,
): Promise<ImageGenerateResult> {
  try {
    const result = await generateImage("replicate", {
      prompt: input.prompt,
      model: input.model,
      aspectRatio: input.aspectRatio,
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

    return {
      summary: `Generated image (${result.width}x${result.height}) via replicate/${input.model}`,
      title: input.title,
      imageUrl,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
    };
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
}) {
  return tool(
    async (input) => {
      return await runImageGenerate(input, deps?.persistImage);
    },
    {
      name: "generate_image",
      description:
        "Generate an image using AI via Replicate. Available models: Nano Banana Pro (Google, best quality), Nano Banana 2 (Google, fast), Imagen 4 (Google flagship), Flux Kontext Pro/Max (image editing), Seedream 5/4.5/4 (Bytedance), Recraft V3 (design-focused). Returns the generated image URL.",
      schema: imageGenerateSchema,
    },
  );
}
