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

type ImageGenerateInput = z.infer<typeof imageGenerateSchema>;

type ImageGenerateResult = {
  summary: string;
  title?: string;
  imageUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  error?: string;
  jobId?: string;
  model?: string;
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
 * Optional function to submit an async image generation job.
 * Returns a job ID that can be polled for completion.
 */
export type SubmitImageJobFn = (input: {
  prompt: string;
  title: string;
  model: string;
  aspectRatio: string;
  inputImages?: string[];
}) => Promise<{ jobId: string }>;

export async function runImageGenerate(
  input: ImageGenerateInput,
  persistImage?: PersistImageFn,
  submitImageJob?: SubmitImageJobFn,
): Promise<ImageGenerateResult> {
  // 异步模式：提交 job 立即返回
  if (submitImageJob) {
    try {
      const { jobId } = await submitImageJob({
        prompt: input.prompt,
        title: input.title,
        model: input.model,
        aspectRatio: input.aspectRatio ?? "1:1",
        ...(input.inputImages ? { inputImages: input.inputImages } : {}),
      });
      const result: ImageGenerateResult = {
        summary: `Image generation job submitted (jobId: ${jobId}), model: ${input.model}`,
        title: input.title,
        jobId,
        model: input.model,
        imageUrl: "",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
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
        summary: `Failed to submit image generation job: ${message}`,
        error: message,
      };
    }
  }

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
  submitImageJob?: SubmitImageJobFn;
}) {
  return tool(
    async (input: ImageGenerateInput) => {
      return await runImageGenerate(input, deps?.persistImage, deps?.submitImageJob);
    },
    {
      name: "generate_image",
      description:
        "Generate an image using AI via Replicate. Available models: Nano Banana Pro (Google, best quality), Nano Banana 2 (Google, fast), Imagen 4 (Google flagship), Flux Kontext Pro/Max (image editing), Seedream 5/4.5/4 (Bytedance), Recraft V3 (design-focused). Returns the generated image URL.",
      schema: imageGenerateSchema,
    },
  );
}
