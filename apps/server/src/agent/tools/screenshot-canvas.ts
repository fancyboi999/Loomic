import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

import type { ConnectionManager } from "../../ws/connection-manager.js";
import type { ScreenshotResult } from "@loomic/shared";

const screenshotCanvasSchema = z.object({
  mode: z
    .enum(["full", "region", "viewport"])
    .describe("full: all elements; region: specific area; viewport: current user view"),
  region: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional()
    .describe("Required when mode is 'region'. Defines the crop rectangle."),
  max_dimension: z
    .number()
    .default(1024)
    .describe("Max width or height in pixels. 512=low, 1024=medium, 2048=high quality"),
});

export function createScreenshotCanvasTool(deps: {
  connectionManager: ConnectionManager;
  rpcTimeout?: number;
}) {
  const timeout = deps.rpcTimeout ?? 10_000;

  return new DynamicStructuredTool({
    name: "screenshot_canvas",
    description:
      "Take a visual screenshot of the canvas to inspect layout, design quality, color harmony, and spatial relationships. Use this to visually verify your changes or understand the current canvas state. Supports full canvas, specific region, or current viewport capture.",
    schema: screenshotCanvasSchema,
    responseFormat: "content_and_artifact",
    func: async (input, _runManager, config): Promise<any> => {
      const userId = (config as any)?.configurable?.user_id;

      if (!userId) {
        return [
          JSON.stringify({
            error: "no_user_context",
            message: "screenshot_canvas requires a user context to communicate with the browser.",
          }),
          {},
        ];
      }

      try {
        const result = await deps.connectionManager.rpc<ScreenshotResult>(
          userId,
          "canvas.screenshot",
          {
            mode: input.mode,
            ...(input.region ? { region: input.region } : {}),
            max_dimension: input.max_dimension,
          },
          timeout,
        );

        const summary = `Canvas screenshot captured (${result.width}x${result.height}, mode: ${input.mode})`;

        // Return multimodal content: text summary + inline image
        // The model receives the image directly for visual understanding
        return [
          [
            { type: "text", text: summary },
            {
              type: "image_url",
              image_url: { url: result.url, detail: "high" },
            },
          ],
          {},
        ];
      } catch (error) {
        const message = error instanceof Error ? error.message : "Screenshot failed";
        return [
          JSON.stringify({
            error: "screenshot_failed",
            message: `Screenshot failed: ${message}`,
          }),
          {},
        ];
      }
    },
  });
}
