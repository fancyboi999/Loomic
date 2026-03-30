import { GoogleGenAI } from "@google/genai";

import type {
  GeneratedVideo,
  ModelInfo,
  VideoGenerateParams,
  VideoProvider,
} from "../types.js";
import { fetchAsBase64, GenerationError } from "../utils.js";

// ── Constants ────────────────────────────────────────────────────────────

const PROVIDER_NAME = "google";

const ICON_GOOGLE =
  "https://tjzk.replicate.delivery/models_organizations_avatar/27e1e3fe-f766-4748-83b3-777bc282d8dd/1342004.png";

/**
 * Maps our internal model IDs (with `google-direct/` prefix) to the
 * actual Gemini API model name. The prefix avoids collision with
 * Replicate-hosted `google/*` models.
 */
const MODEL_MAP: Record<string, string> = {
  "google-direct/veo-3.1-generate-preview": "veo-3.1-generate-preview",
};

const GOOGLE_VIDEO_MODELS: readonly ModelInfo[] = [
  {
    id: "google-direct/veo-3.1-generate-preview",
    displayName: "Veo 3.1 (Direct)",
    description:
      "Google Veo 3.1 video generation via direct API. Supports text-to-video, image-to-video, and audio generation. Max 8s at 1080p. Up to 3 input images.",
    iconUrl: ICON_GOOGLE,
  },
];

/** Maximum polling time in milliseconds (5 minutes). */
const MAX_POLL_DURATION_MS = 300_000;

/** Polling interval in milliseconds. */
const POLL_INTERVAL_MS = 10_000;

/** Allowed durations for Veo 3.1 (seconds). */
const ALLOWED_DURATIONS = [4, 6, 8];

// ── Resolution helpers ───────────────────────────────────────────────────

const BASE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
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

  constructor(apiKey: string) {
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

    const aspectRatio = params.aspectRatio ?? "16:9";
    const resolution = params.resolution ?? "720p";
    const durationSeconds = this.clampDuration(params.duration ?? 8);
    // Note: Veo 3.1 generates audio by default; the Gemini API does not
    // expose a generateAudio toggle, so enableAudio is ignored here.

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
      throw new GenerationError(
        PROVIDER_NAME,
        "api_error",
        `Veo API error: ${err instanceof Error ? err.message : String(err)}`,
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
        throw new GenerationError(
          PROVIDER_NAME,
          "api_error",
          `Polling error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Check for operation-level errors.
    if (operation.error) {
      throw new GenerationError(
        PROVIDER_NAME,
        "api_error",
        `Video generation failed: ${JSON.stringify(operation.error)}`,
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

    return {
      url: video.uri,
      mimeType: video.mimeType ?? "video/mp4",
      width,
      height,
      durationSeconds,
    };
  }

  /**
   * Clamps the requested duration to the nearest allowed value for Veo 3.1.
   */
  private clampDuration(requested: number): number {
    let closest = ALLOWED_DURATIONS[0]!;
    let minDiff = Math.abs(requested - closest);
    for (const d of ALLOWED_DURATIONS) {
      const diff = Math.abs(requested - d);
      if (diff < minDiff) {
        closest = d;
        minDiff = diff;
      }
    }
    return closest;
  }
}
