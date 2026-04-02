import { GoogleGenAI } from "@google/genai";

import type {
  GeneratedVideo,
  VideoGenerateParams,
  VideoModelInfo,
  VideoProvider,
} from "../types.js";
import { fetchAsBase64, GenerationError } from "../utils.js";

// ── Constants ────────────────────────────────────────────────────────────

const PROVIDER_NAME = "google";

const ICON_GOOGLE =
  "https://tjzk.replicate.delivery/models_organizations_avatar/27e1e3fe-f766-4748-83b3-777bc282d8dd/1342004.png";

/**
 * Maps our internal model IDs (with `google-official/` prefix) to the
 * actual Gemini API model name. The prefix avoids collision with
 * Replicate-hosted `google/*` models.
 */
const MODEL_MAP: Record<string, string> = {
  "google-official/veo-3.1-generate-preview": "veo-3.1-generate-preview",
  "google-official/veo-3.1-fast-generate-preview": "veo-3.1-fast-generate-preview",
  "google-official/veo-3.1-lite-generate-preview": "veo-3.1-lite-generate-preview",
  "google-official/veo-3.0-generate-001": "veo-3.0-generate-001",
  "google-official/veo-3.0-fast-generate-001": "veo-3.0-fast-generate-001",
  "google-official/veo-2.0-generate-001": "veo-2.0-generate-001",
};

// ── Per-model capabilities ──────────────────────────────────────────────

interface ModelCapabilities {
  allowedDurations: number[];
  allowedResolutions: string[];
  allowedAspectRatios: string[];
  defaultDuration: number;
  supportsAudio: boolean;
}

const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  "veo-3.1-generate-preview": {
    allowedDurations: [4, 6, 8],
    allowedResolutions: ["720p", "1080p", "4k"],
    allowedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 8,
    supportsAudio: true,
  },
  "veo-3.1-fast-generate-preview": {
    allowedDurations: [4, 6, 8],
    allowedResolutions: ["720p", "1080p", "4k"],
    allowedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 8,
    supportsAudio: true,
  },
  "veo-3.1-lite-generate-preview": {
    allowedDurations: [4, 6, 8],
    allowedResolutions: ["720p", "1080p"],
    allowedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 8,
    supportsAudio: true,
  },
  "veo-3.0-generate-001": {
    allowedDurations: [4, 6, 8],
    allowedResolutions: ["720p", "1080p", "4k"],
    allowedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 8,
    supportsAudio: true,
  },
  "veo-3.0-fast-generate-001": {
    allowedDurations: [4, 6, 8],
    allowedResolutions: ["720p", "1080p", "4k"],
    allowedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 8,
    supportsAudio: true,
  },
  "veo-2.0-generate-001": {
    allowedDurations: [5, 6, 7, 8],
    allowedResolutions: ["720p"],
    allowedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 8,
    supportsAudio: false,
  },
};

// ── Model catalog ────────────────────────────────────────────────────────

/**
 * Helper to derive max resolution label from MODEL_CAPABILITIES.
 */
function deriveMaxResolution(resolutions: string[]): "480p" | "720p" | "1080p" | "2160p" {
  if (resolutions.includes("4k")) return "2160p";
  if (resolutions.includes("1080p")) return "1080p";
  if (resolutions.includes("720p")) return "720p";
  return "480p";
}

function buildVideoModelInfo(
  id: string,
  displayName: string,
  description: string,
  apiModelName: string,
): VideoModelInfo {
  const caps = MODEL_CAPABILITIES[apiModelName]!;
  return {
    id,
    displayName,
    description,
    iconUrl: ICON_GOOGLE,
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      audio: caps.supportsAudio,
    },
    limits: {
      maxDuration: Math.max(...caps.allowedDurations),
      allowedDurations: caps.allowedDurations,
      maxResolution: deriveMaxResolution(caps.allowedResolutions),
      maxInputImages: 7,
    },
  };
}

const GOOGLE_VIDEO_MODELS: readonly VideoModelInfo[] = [
  buildVideoModelInfo(
    "google-official/veo-3.1-generate-preview", "Veo 3.1",
    "Google flagship. T2V + I2V, native audio, reference images, 4–8s, up to 4K. Best quality.",
    "veo-3.1-generate-preview",
  ),
  buildVideoModelInfo(
    "google-official/veo-3.1-fast-generate-preview", "Veo 3.1 Fast",
    "Speed-optimized Veo 3.1. T2V + I2V, native audio, 4–8s, up to 4K. Faster generation.",
    "veo-3.1-fast-generate-preview",
  ),
  buildVideoModelInfo(
    "google-official/veo-3.1-lite-generate-preview", "Veo 3.1 Lite",
    "Lightweight Veo 3.1. T2V + I2V, native audio, 4–8s, up to 1080p. Fastest, lowest cost.",
    "veo-3.1-lite-generate-preview",
  ),
  buildVideoModelInfo(
    "google-official/veo-3.0-generate-001", "Veo 3",
    "Stable Veo 3. T2V + I2V, native audio, reference images, up to 4K. Production-ready.",
    "veo-3.0-generate-001",
  ),
  buildVideoModelInfo(
    "google-official/veo-3.0-fast-generate-001", "Veo 3 Fast",
    "Speed-optimized Veo 3. T2V + I2V, native audio, up to 4K. Faster than Veo 3.",
    "veo-3.0-fast-generate-001",
  ),
  buildVideoModelInfo(
    "google-official/veo-2.0-generate-001", "Veo 2",
    "Stable Veo 2. T2V + I2V, 720p only, silent (no audio), 5–8s. Most cost-effective.",
    "veo-2.0-generate-001",
  ),
];

/** Maximum polling time in milliseconds (5 minutes). */
const MAX_POLL_DURATION_MS = 300_000;

/** Polling interval in milliseconds. */
const POLL_INTERVAL_MS = 10_000;

// ── Resolution helpers ───────────────────────────────────────────────────

const BASE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "4k": { width: 3840, height: 2160 },
};

/**
 * Computes pixel dimensions from resolution + aspect ratio.
 *
 * The resolution controls the short-side baseline while the aspect ratio
 * stretches the other axis proportionally.
 */
function resolutionToDimensions(
  resolution: string,
  aspectRatio: string,
): { width: number; height: number } {
  const base = BASE_DIMENSIONS[resolution];
  if (!base) return { width: 1280, height: 720 };

  const [wStr, hStr] = aspectRatio.split(":");
  const w = Number(wStr);
  const h = Number(hStr);
  if (!w || !h) return base;

  const ratio = w / h;
  if (ratio >= 1) {
    // Landscape or square — height is the short side.
    return { width: Math.round(base.height * ratio), height: base.height };
  }
  // Portrait — short side becomes width, long side becomes height.
  return { width: base.height, height: Math.round(base.height / ratio) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Provider ─────────────────────────────────────────────────────────────

export class GoogleVideoProvider implements VideoProvider {
  readonly name = PROVIDER_NAME;
  readonly models = GOOGLE_VIDEO_MODELS;

  private client: GoogleGenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(params: VideoGenerateParams): Promise<GeneratedVideo> {
    const apiModel = MODEL_MAP[params.model];
    if (!apiModel) {
      throw new GenerationError(
        PROVIDER_NAME,
        "model_not_found",
        `Unknown Google video model: ${params.model}`,
      );
    }

    const caps = MODEL_CAPABILITIES[apiModel];
    if (!caps) {
      throw new GenerationError(
        PROVIDER_NAME,
        "model_not_found",
        `No capabilities defined for model: ${apiModel}`,
      );
    }

    // Validate aspect ratio
    const aspectRatio = params.aspectRatio ?? "16:9";
    if (!caps.allowedAspectRatios.includes(aspectRatio)) {
      throw new GenerationError(
        PROVIDER_NAME,
        "invalid_input",
        `Model ${apiModel} does not support aspectRatio "${aspectRatio}". Supported: ${caps.allowedAspectRatios.join(", ")}.`,
      );
    }

    // Validate & clamp resolution
    let resolution = params.resolution ?? "720p";
    if (!caps.allowedResolutions.includes(resolution)) {
      // Fall back to best available
      resolution = caps.allowedResolutions.includes("1080p") ? "1080p" : "720p";
    }

    const durationSeconds = clampToNearest(
      params.duration ?? caps.defaultDuration,
      caps.allowedDurations,
    );

    // Build image input for image-to-video.
    let image: { imageBytes: string; mimeType: string } | undefined;
    if (params.inputImages?.length) {
      const first = await fetchAsBase64(PROVIDER_NAME, params.inputImages[0]!);
      image = { imageBytes: first.data, mimeType: first.mimeType };
    }

    // Start the asynchronous generation operation.
    let operation;
    try {
      operation = await this.client.models.generateVideos({
        model: apiModel,
        prompt: params.prompt,
        ...(image ? { image } : {}),
        config: {
          aspectRatio,
          durationSeconds,
          resolution,
          numberOfVideos: 1,
        },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[google-video] generateVideos API error:`, detail);
      if (detail.includes("PERMISSION_DENIED") || detail.includes("403") || detail.includes("SERVICE_DISABLED")) {
        throw new GenerationError(
          PROVIDER_NAME,
          "api_error",
          "Video generation service is temporarily unavailable. Please try a different model.",
        );
      }
      throw new GenerationError(
        PROVIDER_NAME,
        "api_error",
        "Video generation failed unexpectedly. Please try again or use a different model.",
      );
    }

    // Poll until the operation completes or we hit the timeout.
    const deadline = Date.now() + MAX_POLL_DURATION_MS;
    while (!operation.done) {
      if (Date.now() >= deadline) {
        throw new GenerationError(
          PROVIDER_NAME,
          "timeout",
          `Video generation timed out after ${MAX_POLL_DURATION_MS / 1000}s`,
        );
      }
      await sleep(POLL_INTERVAL_MS);
      try {
        operation = await this.client.operations.getVideosOperation({
          operation,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[google-video] polling error:`, detail);
        throw new GenerationError(
          PROVIDER_NAME,
          "api_error",
          "Video generation status check failed. Please try again.",
        );
      }
    }

    // Check for operation-level errors.
    if (operation.error) {
      console.error(`[google-video] operation error:`, JSON.stringify(operation.error));
      throw new GenerationError(
        PROVIDER_NAME,
        "api_error",
        "Video generation was rejected by the provider. Please try a different prompt or model.",
      );
    }

    // Check for safety / RAI filtering.
    const response = operation.response;
    if (!response?.generatedVideos?.length) {
      const raiReasons = response?.raiMediaFilteredReasons;
      if (raiReasons?.length) {
        throw new GenerationError(
          PROVIDER_NAME,
          "safety_filter",
          `Video blocked by safety filter: ${raiReasons.join(", ")}`,
        );
      }
      if (response?.raiMediaFilteredCount) {
        throw new GenerationError(
          PROVIDER_NAME,
          "safety_filter",
          "Video blocked by safety filter",
        );
      }
      throw new GenerationError(
        PROVIDER_NAME,
        "no_output",
        "Veo returned no generated videos",
      );
    }

    const generatedVideo = response.generatedVideos[0]!;
    const video = generatedVideo.video;
    if (!video?.uri) {
      throw new GenerationError(
        PROVIDER_NAME,
        "no_output",
        "Veo returned no video URI",
      );
    }

    const { width, height } = resolutionToDimensions(resolution, aspectRatio);

    // The Veo download URI requires authentication. Append the API key so
    // the worker can fetch it with a plain `fetch()` call. This URL is only
    // used internally — the worker re-uploads to Supabase storage and
    // returns a public signed URL to the user, so the key is never exposed.
    const separator = video.uri.includes("?") ? "&" : "?";
    const authenticatedUrl = `${video.uri}${separator}key=${this.apiKey}`;

    return {
      url: authenticatedUrl,
      mimeType: video.mimeType ?? "video/mp4",
      width,
      height,
      durationSeconds,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Clamps a value to the nearest allowed value in the list. */
function clampToNearest(requested: number, allowed: number[]): number {
  let closest = allowed[0]!;
  let minDiff = Math.abs(requested - closest);
  for (const v of allowed) {
    const diff = Math.abs(requested - v);
    if (diff < minDiff) {
      closest = v;
      minDiff = diff;
    }
  }
  return closest;
}
