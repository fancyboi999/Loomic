import { tool } from "langchain";
import { z } from "zod";

import { generateVideo } from "../../generation/video-generation.js";

const videoGenerateSchema = z.object({
  prompt: z.string().min(1).describe("Detailed video generation prompt"),
  provider: z.string().describe("Provider: volces"),
  model: z.string().describe("Model identifier"),
  resolution: z.enum(["480p", "720p", "1080p"]).optional().default("720p"),
  duration: z.number().int().min(5).max(10).optional().default(5),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().default("16:9"),
  inputImages: z.array(z.string()).optional().describe("First frame reference image URLs"),
});

type VideoGenerateResult = {
  summary: string;
  videoUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  error?: string;
};

export async function runVideoGenerate(
  input: z.infer<typeof videoGenerateSchema>,
): Promise<VideoGenerateResult> {
  try {
    const result = await generateVideo(input.provider, {
      prompt: input.prompt,
      model: input.model,
      resolution: input.resolution,
      duration: input.duration as 5 | 10,
      aspectRatio: input.aspectRatio,
      ...(input.inputImages?.length ? { inputImages: input.inputImages } : {}),
    });

    return {
      summary: `Generated ${result.durationSeconds}s video (${result.width}x${result.height}) via ${input.provider}/${input.model}`,
      videoUrl: result.url,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      durationSeconds: result.durationSeconds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      summary: `Video generation failed: ${message}`,
      error: message,
    };
  }
}

export function createVideoGenerateTool() {
  return tool(
    async (input) => {
      return await runVideoGenerate(input);
    },
    {
      name: "generate_video",
      description:
        "Generate a video using AI. Currently supports volces provider. Returns the generated video URL.",
      schema: videoGenerateSchema,
    },
  );
}
