import type { StructuredTool } from "@langchain/core/tools";
import { tool } from "@langchain/core/tools";
import type { BackendFactory, BackendProtocol } from "deepagents";
import { z } from "zod";

import type { ConnectionManager } from "../../ws/connection-manager.js";
import { createBrandKitTool } from "./brand-kit.js";
import { createInspectCanvasTool } from "./inspect-canvas.js";
import { createManipulateCanvasTool } from "./manipulate-canvas.js";
import {
  createImageGenerateTool,
  type PersistImageFn,
  type SubmitImageJobFn,
} from "./image-generate.js";
import { createProjectSearchTool } from "./project-search.js";
import { createScreenshotCanvasTool } from "./screenshot-canvas.js";
import { createVideoGenerateTool } from "./video-generate.js";

/**
 * Zero-side-effect tool that lets the agent reason step-by-step before acting.
 * Useful for planning multi-step canvas operations, analyzing inspect_canvas
 * results, or deciding image model selection when reference images are involved.
 */
const thinkTool = tool(
  async (input) => input.thought,
  {
    name: "think",
    description:
      "Use this tool to think through complex problems step by step before taking action. " +
      "Call this when you need to plan a multi-step canvas operation, analyze element data from " +
      "inspect_canvas, or decide which image model to use. No side effects — just returns your reasoning.",
    schema: z.object({
      thought: z.string().describe("Your step-by-step reasoning and analysis"),
    }),
  },
);

export { createImageGenerateTool } from "./image-generate.js";
export { createVideoGenerateTool } from "./video-generate.js";
export { createInspectCanvasTool } from "./inspect-canvas.js";
export { createManipulateCanvasTool } from "./manipulate-canvas.js";

export function createMainAgentTools(
  backend: BackendProtocol | BackendFactory,
  deps: {
    createUserClient: (accessToken: string) => any;
    brandKitId?: string | null;
    connectionManager?: ConnectionManager;
    persistImage?: PersistImageFn;
    submitImageJob?: SubmitImageJobFn;
  },
) {
  const tools: StructuredTool[] = [
    thinkTool,
    createProjectSearchTool(backend),
    createInspectCanvasTool(deps),
    createManipulateCanvasTool(deps),
    createImageGenerateTool({
      ...(deps.persistImage ? { persistImage: deps.persistImage } : {}),
      ...(deps.submitImageJob ? { submitImageJob: deps.submitImageJob } : {}),
    }),
  ];
  if (deps.brandKitId) {
    tools.push(createBrandKitTool(deps, deps.brandKitId));
  }
  if (deps.connectionManager) {
    tools.push(createScreenshotCanvasTool({ connectionManager: deps.connectionManager }));
  }
  return tools;
}

/** @deprecated Use createMainAgentTools + sub-agents instead */
export function createPhaseATools(backend: BackendProtocol | BackendFactory) {
  return [
    createProjectSearchTool(backend),
    createImageGenerateTool(),
    createVideoGenerateTool(),
  ] as const;
}
