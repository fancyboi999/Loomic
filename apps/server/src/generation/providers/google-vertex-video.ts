import { GoogleGenAI } from "@google/genai";
import { GoogleAuth } from "google-auth-library";

import type {
  GeneratedVideo,
  VideoGenerateParams,
  VideoModelInfo,
  VideoProvider,
} from "../types.js";
import { fetchAsBase64, GenerationError } from "../utils.js";

// ── Constants ────────────────────────────────────────────────────────────

const PROVIDER_NAME = "google-vertex";

const ICON_GOOGLE =
  "https://tjzk.replicate.delivery/models_organizations_avatar/27e1e3fe-f766-4748-83b3-777bc282d8dd/1342004.png";

/**
 * Maps internal model IDs (with `google-vertex/` prefix) to the
 * actual Veo API model name.
 */
const MODEL_MAP: Record<string, string> = {
  "google-vertex/veo-3.1-generate-preview": "veo-3.1-generate-preview",
  "google-vertex/veo-3.1-fast-generate-preview": "veo-3.1-fast-generate-preview",
  "google-vertex/veo-3.0-generate-001": "veo-3.0-generate-001",
  "google-vertex/veo-3.0-fast-generate-001": "veo-3.0-fast-generate-001",
  "google-vertex/veo-2.0-generate-001": "veo-2.0-generate-001",
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

const GOOGLE_VERTEX_VIDEO_MODELS: readonly VideoModelInfo[] = [
  {
    id: "google-vertex/veo-3.1-generate-preview",
    displayName: "Veo 3.1 (Vertex)",
    description:
      "Google flagship via Vertex AI. T2V + I2V, native audio, reference images, 4–8s, up to 4K. Best quality.",
    iconUrl: ICON_GOOGLE,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 8, allowedDurations: [4, 6, 8], maxResolution: "2160p", maxInputImages: 1 },
  },
  {
    id: "google-vertex/veo-3.1-fast-generate-preview",
    displayName: "Veo 3.1 Fast (Vertex)",
    description:
      "Speed-optimized Veo 3.1 via Vertex AI. T2V + I2V, native audio, 4–8s, up to 4K. Faster generation.",
    iconUrl: ICON_GOOGLE,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 8, allowedDurations: [4, 6, 8], maxResolution: "2160p", maxInputImages: 1 },
  },
  {
    id: "google-vertex/veo-3.0-generate-001",
    displayName: "Veo 3 (Vertex)",
    description:
      "Stable Veo 3 via Vertex AI. T2V + I2V, native audio, reference images, up to 4K. Production-ready.",
    iconUrl: ICON_GOOGLE,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 8, allowedDurations: [4, 6, 8], maxResolution: "2160p", maxInputImages: 1 },
  },
  {
    id: "google-vertex/veo-3.0-fast-generate-001",
    displayName: "Veo 3 Fast (Vertex)",
    description:
      "Speed-optimized Veo 3 via Vertex AI. T2V + I2V, native audio, up to 4K. Faster than Veo 3.",
    iconUrl: ICON_GOOGLE,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 8, allowedDurations: [4, 6, 8], maxResolution: "2160p", maxInputImages: 1 },
  },
  {
    id: "google-vertex/veo-2.0-generate-001",
    displayName: "Veo 2 (Vertex)",
    description:
      "Stable Veo 2 via Vertex AI. T2V + I2V, 720p only, silent (no audio), 5–8s. Most cost-effective.",
    iconUrl: ICON_GOOGLE,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: false },
    limits: { maxDuration: 8, allowedDurations: [5, 6, 7, 8], maxResolution: "720p", maxInputImages: 1 },
  },
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
    return { width: Math.round(base.height * ratio), height: base.height };
  }
  return { width: base.height, height: Math.round(base.height / ratio) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Provider ─────────────────────────────────────────────────────────────

export interface GoogleVertexConfig {
  project: string;
  location: string;
}

export class GoogleVertexVideoProvider implements VideoProvider {
  readonly name = PROVIDER_NAME;
  readonly models = GOOGLE_VERTEX_VIDEO_MODELS;

  private client: GoogleGenAI;
  private auth: GoogleAuth;

  constructor(config: GoogleVertexConfig) {
    this.client = new GoogleGenAI({
      vertexai: true,
      project: config.project,
      location: config.location,
    });
    // GoogleAuth automatically picks up GOOGLE_APPLICATION_CREDENTIALS
    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    console.log(`[google-vertex-video] Initialized Vertex AI provider (project=${config.project}, location=${config.location})`);
  }

  async generate(params: VideoGenerateParams): Promise<GeneratedVideo> {
    const apiModel = MODEL_MAP[params.model];
    if (!apiModel) {
      throw new GenerationError(
        PROVIDER_NAME,
        "model_not_found",
        `Unknown Google Vertex video model: ${params.model}`,
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
      console.error(`[google-vertex-video] generateVideos API error:`, detail);
      if (detail.includes("PERMISSION_DENIED") || detail.includes("403") || detail.includes("SERVICE_DISABLED")) {
        throw new GenerationError(
          PROVIDER_NAME,
          "api_error",
          "Vertex AI video generation service is unavailable. Check that the Vertex AI API is enabled and the service account has aiplatform.user role.",
        );
      }
      throw new GenerationError(
        PROVIDER_NAME,
        "api_error",
        "Vertex AI video generation failed unexpectedly. Please try again or use a different model.",
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
        console.error(`[google-vertex-video] polling error:`, detail);
        throw new GenerationError(
          PROVIDER_NAME,
          "api_error",
          "Video generation status check failed. Please try again.",
        );
      }
    }

    // Check for operation-level errors.
    if (operation.error) {
      console.error(`[google-vertex-video] operation error:`, JSON.stringify(operation.error));
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
    const mimeType = video?.mimeType ?? "video/mp4";
    const { width, height } = resolutionToDimensions(resolution, aspectRatio);

    // Vertex AI returns videoBytes (base64 inline data) instead of a download URI.
    // Developer API returns a URI; Vertex AI returns the raw bytes directly.
    if (video?.videoBytes) {
      const sizeKB = Math.round(video.videoBytes.length * 0.75 / 1024);
      console.log(`[google-vertex-video] Got inline video: ${mimeType}, ~${sizeKB}KB`);
      const dataUri = `data:${mimeType};base64,${video.videoBytes}`;
      return { url: dataUri, mimeType, width, height, durationSeconds };
    }

    // Fallback: if Vertex AI returns a URI (future API changes), authenticate it.
    if (video?.uri) {
      let authenticatedUrl: string;
      try {
        const client = await this.auth.getClient();
        const tokenResponse = await client.getAccessToken();
        const accessToken = tokenResponse.token;
        if (!accessToken) {
          throw new Error("Failed to obtain access token from service account");
        }
        const separator = video.uri.includes("?") ? "&" : "?";
        authenticatedUrl = `${video.uri}${separator}access_token=${accessToken}`;
      } catch (err) {
        console.error(`[google-vertex-video] Failed to get access token for video download:`, err);
        authenticatedUrl = video.uri;
      }
      return { url: authenticatedUrl, mimeType, width, height, durationSeconds };
    }

    throw new GenerationError(
      PROVIDER_NAME,
      "no_output",
      "Veo returned no video data (no videoBytes or URI)",
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

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
