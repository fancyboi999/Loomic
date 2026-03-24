import { z } from "zod";
import type { SubAgent } from "deepagents";

import {
  createImageGenerateTool,
  type PersistImageFn,
} from "./tools/image-generate.js";
import { createVideoGenerateTool } from "./tools/video-generate.js";

const imageGenerateResponseSchema = z.object({
  url: z.string().describe("Generated image URL"),
  placement: z
    .object({
      x: z.number().describe("Left edge x coordinate on canvas"),
      y: z.number().describe("Top edge y coordinate on canvas"),
      width: z.number().default(512).describe("Display width"),
      height: z.number().default(512).describe("Display height"),
    })
    .describe("Where to place the image on the canvas"),
});

export function createImageSubAgent(deps?: {
  persistImage?: PersistImageFn;
}): SubAgent {
  return {
    name: "image_generate",
    description:
      "Generate an image based on a creative description. Returns the image URL and suggested canvas placement coordinates. Include canvas context in the task description so the sub-agent can avoid overlapping existing elements.",
    systemPrompt: `You are an image generation specialist. Given a description and optional canvas context, generate an image using the generate_image tool, then return structured placement data.

When canvas context is provided in the task description (element positions, bounding box), choose placement coordinates that avoid overlapping with existing elements. Place new images below or to the right of existing content.

If no canvas context is provided, use x: 0, y: 0 as default placement.

After calling generate_image, construct your response with the returned URL and calculated placement.`,
    tools: [createImageGenerateTool(deps)],
    responseFormat: imageGenerateResponseSchema,
  };
}

export function createVideoSubAgent(): SubAgent {
  return {
    name: "video_generate",
    description:
      "Generate a video based on a creative description. Video generation availability depends on provider configuration.",
    systemPrompt: `You are a video generation specialist. Given a description, generate a video using the generate_video tool and return the result.

If video generation is not available or fails, clearly explain the limitation.`,
    tools: [createVideoGenerateTool()],
  };
}
