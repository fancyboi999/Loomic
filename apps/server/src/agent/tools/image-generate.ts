import { tool } from "langchain";
import { z } from "zod";

import { generateImage } from "../../generation/image-generation.js";

const imageGenerateSchema = z.object({
  prompt: z.string().min(1).describe("Detailed image generation prompt"),
  provider: z.string().describe("Provider: openai, replicate, or volces"),
  model: z.string().describe("Model identifier"),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().default("1:1"),
  inputImages: z.array(z.string().url()).optional().describe("Reference images for img2img"),
});

type ImageGenerateInput = z.infer<typeof imageGenerateSchema>;

type ImageGenerateResult = {
  summary: string;
  imageUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  error?: string;
};

export async function runImageGenerate(
  input: ImageGenerateInput,
): Promise<ImageGenerateResult> {
  try {
    const result = await generateImage(input.provider, {
      prompt: input.prompt,
      model: input.model,
      aspectRatio: input.aspectRatio,
      inputImages: input.inputImages,
    });

    return {
      summary: `Generated image (${result.width}x${result.height}) via ${input.provider}/${input.model}`,
      imageUrl: result.url,
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

export function createImageGenerateTool() {
  return tool(
    async (input) => {
      return await runImageGenerate(input);
    },
    {
      name: "generate_image",
      description:
        "Generate an image using AI. Supports multiple providers (openai, replicate, volces) and models. Returns the generated image URL.",
      schema: imageGenerateSchema,
    },
  );
}
