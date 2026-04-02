import { tool } from "langchain";
import { z } from "zod";

import { generateVideo } from "../../generation/video-generation.js";
import {
  getAvailableVideoModels,
  resolveVideoProviderName,
  type AvailableModel,
} from "../../generation/providers/registry.js";

const DEFAULT_MODEL = "wan-video/wan-2.6";

// ── Submit function type ───────────────────────────────────────────────────

export type SubmitVideoJobFn = (input: {
  prompt: string;
  model: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  inputImages?: string[];
  inputVideo?: string;
  enableAudio?: boolean;
}) => Promise<{
  jobId: string;
  videoUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  mimeType?: string;
  error?: string;
}>;

// ── Dynamic schema builder ─────────────────────────────────────────────────

function buildVideoGenerateSchema(models: AvailableModel[]) {
  const modelIds = models.map((m) => m.id);
  const defaultModel = modelIds.includes(DEFAULT_MODEL)
    ? DEFAULT_MODEL
    : modelIds[0] ?? DEFAULT_MODEL;

  const modelDescription = models.length
    ? `Video model to use. Available:\n${models.map((m) => `- ${m.id}: ${m.description}`).join("\n")}`
    : "Model identifier (no video providers currently registered)";

  const modelField =
    modelIds.length >= 1
      ? z
          .enum(modelIds as [string, ...string[]])
          .default(defaultModel as (typeof modelIds)[number])
          .describe(modelDescription)
      : z.string().default(DEFAULT_MODEL).describe(modelDescription);

  return z.object({
    prompt: z
      .string()
      .min(1)
      .describe(
        "Detailed video generation prompt. Be specific about motion, camera angles, lighting, mood, action, and scene transitions.",
      ),
    model: modelField,
    duration: z
      .number()
      .int()
      .min(3)
      .max(16)
      .optional()
      .default(5)
      .describe(
        "Video duration in seconds. Valid range depends on model (see model descriptions). Google Veo supports 4/6/8, Replicate models support 3-16.",
      ),
    resolution: z
      .enum(["480p", "720p", "1080p", "4k"])
      .optional()
      .default("720p")
      .describe("Output resolution. 720p recommended for balance of quality and speed. 1080p/4k supported by Google Veo official models (8s duration required)."),
    aspectRatio: z
      .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
      .optional()
      .default("16:9")
      .describe("Video aspect ratio. 16:9 for landscape, 9:16 for portrait/mobile."),
    inputImages: z
      .array(z.string())
      .max(7)
      .optional()
      .describe(
        "Reference image URLs for image-to-video. First image used as first frame. Only for models with I2V capability.",
      ),
    inputVideo: z
      .string()
      .optional()
      .describe("Source video URL for video-to-video editing. Only for Kling O1."),
    enableAudio: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Generate synchronized audio (dialogue, sound effects, ambient). Not all models support this — ignored for models without audio capability.",
      ),
    placementX: z
      .number()
      .optional()
      .describe(
        "Canvas X coordinate for video placement. Use inspect_canvas to find a good position.",
      ),
    placementY: z
      .number()
      .optional()
      .describe(
        "Canvas Y coordinate for video placement. Use inspect_canvas to find a good position.",
      ),
    placementWidth: z
      .number()
      .optional()
      .describe("Width on canvas (default: 640)"),
    placementHeight: z
      .number()
      .optional()
      .describe("Height on canvas (default: 360)"),
  });
}

// ── Result type ────────────────────────────────────────────────────────────

type VideoGenerateInput = z.infer<ReturnType<typeof buildVideoGenerateSchema>>;

type VideoGenerateResult = {
  summary: string;
  videoUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  placement?: { x: number; y: number; width: number; height: number };
  error?: string;
};

// ── Run function ───────────────────────────────────────────────────────────

export async function runVideoGenerate(
  input: VideoGenerateInput,
  submitVideoJob?: SubmitVideoJobFn,
): Promise<VideoGenerateResult> {
  const t0 = Date.now();
  const lap = (label: string, extra?: Record<string, unknown>) => {
    console.log(`[generate_video] ${label} +${Date.now() - t0}ms`, extra ? JSON.stringify(extra) : "");
  };

  // Filter invalid image references
  if (input.inputImages?.length) {
    const validImages = input.inputImages.filter(
      (img) => img.startsWith("http://") || img.startsWith("https://") || img.startsWith("data:"),
    );
    input = { ...input, inputImages: validImages.length > 0 ? validImages : undefined };
  }

  // Job mode: submit to PGMQ and wait for worker
  if (submitVideoJob) {
    try {
      lap("job_submit", { model: input.model });
      const jobResult = await submitVideoJob({
        prompt: input.prompt,
        model: input.model,
        duration: input.duration,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        ...(input.inputImages ? { inputImages: input.inputImages } : {}),
        ...(input.inputVideo ? { inputVideo: input.inputVideo } : {}),
        enableAudio: input.enableAudio,
      });

      if (jobResult.error) {
        lap("job_failed", { error: jobResult.error });
        return {
          summary: `Video generation failed with model ${input.model}: ${jobResult.error}. Consider trying a different model or simplifying the prompt.`,
          error: jobResult.error,
        };
      }
      lap("job_complete", { jobId: jobResult.jobId });

      const result: VideoGenerateResult = {
        summary: `Generated ${jobResult.durationSeconds ?? input.duration}s video (${jobResult.width ?? 0}x${jobResult.height ?? 0}) via ${input.model}`,
        videoUrl: jobResult.videoUrl,
        mimeType: jobResult.mimeType ?? "video/mp4",
        width: jobResult.width,
        height: jobResult.height,
        durationSeconds: jobResult.durationSeconds,
      };
      if (input.placementX != null && input.placementY != null) {
        result.placement = {
          x: input.placementX,
          y: input.placementY,
          width: input.placementWidth ?? 640,
          height: input.placementHeight ?? 360,
        };
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        summary: `Video generation failed with model ${input.model}: ${message}`,
        error: message,
      };
    }
  }

  // Direct mode: call provider directly
  try {
    lap("direct_generate_start", { model: input.model });
    const providerName = resolveVideoProviderName(input.model);
    const result = await generateVideo(providerName, {
      prompt: input.prompt,
      model: input.model,
      duration: input.duration,
      resolution: input.resolution as "480p" | "720p" | "1080p" | undefined,
      aspectRatio: input.aspectRatio,
      ...(input.inputImages ? { inputImages: input.inputImages } : {}),
      ...(input.inputVideo ? { inputVideo: input.inputVideo } : {}),
      enableAudio: input.enableAudio,
    });
    lap("direct_generate_done");

    const directResult: VideoGenerateResult = {
      summary: `Generated ${result.durationSeconds}s video (${result.width}x${result.height}) via ${input.model}`,
      videoUrl: result.url,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      durationSeconds: result.durationSeconds,
    };
    if (input.placementX != null && input.placementY != null) {
      directResult.placement = {
        x: input.placementX,
        y: input.placementY,
        width: input.placementWidth ?? 640,
        height: input.placementHeight ?? 360,
      };
    }
    return directResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      summary: `Video generation failed: ${message}`,
      error: message,
    };
  }
}

// ── Tool factory ───────────────────────────────────────────────────────────

export function createVideoGenerateTool(deps?: {
  submitVideoJob?: SubmitVideoJobFn;
  availableModels?: AvailableModel[];
}) {
  const models = deps?.availableModels ?? getAvailableVideoModels();

  const modelSummary = models.length
    ? models.map((m) => `${m.displayName} (${m.id})`).join(", ")
    : "No video models available";

  return tool(
    async (input: VideoGenerateInput) => {
      return await runVideoGenerate(input, deps?.submitVideoJob);
    },
    {
      name: "generate_video",
      description: `Generate a video using AI. Available models: ${modelSummary}. Supports text-to-video, image-to-video, and video editing. Returns the generated video URL.`,
      schema: buildVideoGenerateSchema(models),
    },
  );
}
