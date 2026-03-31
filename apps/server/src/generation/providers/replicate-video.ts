import type { GeneratedVideo, VideoGenerateParams, VideoModelInfo, VideoProvider } from "../types.js";
import { GenerationError } from "../utils.js";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

// ── Icons ──────────────────────────────────────────────────────────────────
const ICON_KLING = "https://github.com/nicekid1.png";
const ICON_BYTEDANCE = "https://github.com/bytedance.png";
const ICON_WAN = "https://github.com/Wan-Video.png";
const ICON_OPENAI = "https://github.com/openai.png";
const ICON_GOOGLE = "https://tjzk.replicate.delivery/models_organizations_avatar/27e1e3fe-f766-4748-83b3-777bc282d8dd/1342004.png";
const ICON_MINIMAX = "https://github.com/MiniMax-AI.png";

// ── Model definitions ──────────────────────────────────────────────────────

const REPLICATE_VIDEO_MODELS: readonly VideoModelInfo[] = [
  {
    id: "kwaivgi/kling-v3-video",
    displayName: "Kling 3.0",
    description: "Kling 3.0: T2V+I2V, native audio, multi-shot (up to 6 scenes), 3-15s, 1080p. Best for cinematic quality.",
    iconUrl: ICON_KLING,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 15, allowedDurations: [5, 10, 15], maxResolution: "1080p", maxInputImages: 1 },
  },
  {
    id: "kwaivgi/kling-v3-omni-video",
    displayName: "Kling 3.0 Omni",
    description: "Kling 3.0 Omni: T2V+I2V+V2V editing, up to 7 reference images, style transfer, 3-15s, 1080p.",
    iconUrl: ICON_KLING,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: true, audio: true },
    limits: { maxDuration: 15, allowedDurations: [5, 10, 15], maxResolution: "1080p", maxInputImages: 7 },
  },
  {
    id: "kwaivgi/kling-v2.6",
    displayName: "Kling 2.6",
    description: "Kling 2.6: T2V+I2V, audio with lip-sync, 5-10s, 1080p. Good balance of quality and cost.",
    iconUrl: ICON_KLING,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 10, allowedDurations: [5, 10], maxResolution: "1080p", maxInputImages: 1 },
  },
  {
    id: "kwaivgi/kling-o1",
    displayName: "Kling O1",
    description: "Kling O1: V2V editing only — edit existing videos with natural language instructions. Up to 4K, 3-10s.",
    iconUrl: ICON_KLING,
    capabilities: { textToVideo: false, imageToVideo: false, videoToVideo: true, audio: true },
    limits: { maxDuration: 10, allowedDurations: [3, 5, 10], maxResolution: "2160p", maxInputImages: 0 },
  },
  {
    id: "bytedance/seedance-1.5-pro",
    displayName: "Seedance 1.5 Pro",
    description: "Seedance 1.5 Pro: T2V+I2V, audio with lip-sync in 9 languages, 5-10s, 1080p.",
    iconUrl: ICON_BYTEDANCE,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 10, allowedDurations: [5, 10], maxResolution: "1080p", maxInputImages: 1 },
  },
  {
    id: "wan-video/wan-2.6",
    displayName: "Wan 2.6",
    description: "Wan 2.6: T2V+I2V, audio, up to 10s, 1080p. Open-source, good value. Auto-routes to T2V or I2V endpoint.",
    iconUrl: ICON_WAN,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 10, allowedDurations: [5, 10], maxResolution: "1080p", maxInputImages: 1 },
  },
  {
    id: "openai/sora-2",
    displayName: "Sora 2",
    description: "Sora 2: T2V+I2V, synced audio (dialogue+SFX), 4-12s, 1080p. Strong prompt following.",
    iconUrl: ICON_OPENAI,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 12, allowedDurations: [4, 6, 8, 10, 12], maxResolution: "1080p", maxInputImages: 1 },
  },
  {
    id: "openai/sora-2-pro",
    displayName: "Sora 2 Pro",
    description: "Sora 2 Pro: Premium T2V+I2V, higher quality audio sync, 4-12s, 1080p.",
    iconUrl: ICON_OPENAI,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 12, allowedDurations: [4, 6, 8, 10, 12], maxResolution: "1080p", maxInputImages: 1 },
  },
  {
    id: "google/veo-3",
    displayName: "Veo 3",
    description: "Veo 3: T2V only, native audio (dialogue+SFX+ambient), 8s, 1080p. Google's flagship.",
    iconUrl: ICON_GOOGLE,
    capabilities: { textToVideo: true, imageToVideo: false, videoToVideo: false, audio: true },
    limits: { maxDuration: 8, allowedDurations: [8], maxResolution: "1080p", maxInputImages: 0 },
  },
  {
    id: "google/veo-3.1",
    displayName: "Veo 3.1",
    description: "Veo 3.1: T2V+I2V, native audio, reference images, end-frame control, 4-8s, 1080p.",
    iconUrl: ICON_GOOGLE,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 8, allowedDurations: [4, 6, 8], maxResolution: "1080p", maxInputImages: 3 },
  },
  {
    id: "google/veo-3.1-fast",
    displayName: "Veo 3.1 Fast",
    description: "Veo 3.1 Fast: Faster variant of Veo 3.1. T2V+I2V, native audio, 4-8s, 1080p.",
    iconUrl: ICON_GOOGLE,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: true },
    limits: { maxDuration: 8, allowedDurations: [4, 6, 8], maxResolution: "1080p", maxInputImages: 3 },
  },
  {
    id: "minimax/hailuo-2.3",
    displayName: "Hailuo 2.3",
    description: "Hailuo 2.3: T2V+I2V, no audio, 6-10s, 1080p. MiniMax's latest video model.",
    iconUrl: ICON_MINIMAX,
    capabilities: { textToVideo: true, imageToVideo: true, videoToVideo: false, audio: false },
    limits: { maxDuration: 10, allowedDurations: [6, 10], maxResolution: "1080p", maxInputImages: 1 },
  },
];

// ── Model-specific parameter builders ──────────────────────────────────────

/** Wan 2.6 uses separate T2V and I2V endpoints on Replicate. */
function resolveWanEndpoint(hasImage: boolean): string {
  return hasImage ? "wan-video/wan-2.6-i2v" : "wan-video/wan-2.6-t2v";
}

function buildModelInput(
  params: VideoGenerateParams,
  model: VideoModelInfo,
): { endpoint: string; input: Record<string, unknown> } {
  const input: Record<string, unknown> = { prompt: params.prompt };
  let endpoint = params.model;

  const hasImage = (params.inputImages?.length ?? 0) > 0;
  const duration = params.duration ?? 5;
  const aspectRatio = params.aspectRatio ?? "16:9";

  switch (params.model) {
    case "kwaivgi/kling-v3-video":
    case "kwaivgi/kling-v3-omni-video":
    case "kwaivgi/kling-v2.6": {
      input.duration = String(duration);
      input.aspect_ratio = aspectRatio;
      if (hasImage) input.image_url = params.inputImages![0];
      if (params.enableAudio !== false) input.audio = true;
      break;
    }

    case "kwaivgi/kling-o1": {
      if (!params.inputVideo) {
        throw new GenerationError("replicate", "invalid_input", "Kling O1 requires inputVideo for V2V editing");
      }
      input.input_video = params.inputVideo;
      input.duration = String(duration);
      break;
    }

    case "bytedance/seedance-1.5-pro": {
      input.duration = duration;
      input.aspect_ratio = aspectRatio;
      if (hasImage) input.image = params.inputImages![0];
      if (params.enableAudio !== false) input.audio = true;
      break;
    }

    case "wan-video/wan-2.6": {
      endpoint = resolveWanEndpoint(hasImage);
      input.duration = duration;
      input.aspect_ratio = aspectRatio;
      if (params.resolution) input.resolution = params.resolution;
      if (hasImage) input.image = params.inputImages![0];
      if (params.enableAudio !== false) input.enable_audio = true;
      break;
    }

    case "openai/sora-2":
    case "openai/sora-2-pro": {
      input.duration = duration;
      input.resolution = params.resolution ?? "720p";
      input.aspect_ratio = aspectRatio;
      if (hasImage) input.image_url = params.inputImages![0];
      break;
    }

    case "google/veo-3": {
      input.duration = duration;
      input.aspect_ratio = aspectRatio;
      if (params.enableAudio !== false) input.generate_audio = true;
      break;
    }

    case "google/veo-3.1":
    case "google/veo-3.1-fast": {
      input.duration = duration;
      input.aspect_ratio = aspectRatio;
      if (hasImage) input.image = params.inputImages![0];
      if (params.enableAudio !== false) input.generate_audio = true;
      break;
    }

    case "minimax/hailuo-2.3": {
      input.duration = duration;
      input.aspect_ratio = aspectRatio;
      if (hasImage) input.image_url = params.inputImages![0];
      break;
    }

    default:
      throw new GenerationError("replicate", "unknown_model", `Unknown video model: ${params.model}`);
  }

  return { endpoint, input };
}

// ── Resolution helpers ─────────────────────────────────────────────────────

const RESOLUTION_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "2160p": { width: 3840, height: 2160 },
};

function getVideoDimensions(resolution: string, aspectRatio: string): { width: number; height: number } {
  const base = RESOLUTION_DIMENSIONS[resolution] ?? RESOLUTION_DIMENSIONS["720p"];
  // For portrait ratios, swap width/height
  if (aspectRatio === "9:16" || aspectRatio === "3:4") {
    return { width: base.height, height: base.width };
  }
  return base;
}

// ── Provider implementation ────────────────────────────────────────────────

export class ReplicateVideoProvider implements VideoProvider {
  readonly name = "replicate";
  readonly models = REPLICATE_VIDEO_MODELS;
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async generate(params: VideoGenerateParams): Promise<GeneratedVideo> {
    const modelInfo = REPLICATE_VIDEO_MODELS.find((m) => m.id === params.model);
    if (!modelInfo) {
      throw new GenerationError("replicate", "unknown_model", `Unknown video model: ${params.model}`);
    }

    const { endpoint, input } = buildModelInput(params, modelInfo);
    const resolution = params.resolution ?? "720p";
    const { width, height } = getVideoDimensions(resolution, params.aspectRatio ?? "16:9");

    // Try synchronous wait first (Prefer: wait), fall back to polling
    const response = await fetch(
      `${REPLICATE_API_BASE}/models/${endpoint}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          Prefer: "wait=300",
        },
        body: JSON.stringify({ input }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new GenerationError(
        "replicate",
        "api_error",
        `Replicate API error ${response.status}: ${(errorBody as { detail?: string })?.detail ?? "Unknown error"}`,
      );
    }

    const data = (await response.json()) as {
      id: string;
      output: string | string[] | null;
      status: string;
      urls?: { get?: string };
    };

    // If prediction is still processing (Prefer: wait timed out), poll for result
    let output = data.output;
    if (!output && data.status === "processing" && data.urls?.get) {
      output = await this.pollForResult(data.urls.get);
    }

    const outputUrl = Array.isArray(output) ? output[0] : output;
    if (!outputUrl) {
      throw new GenerationError("replicate", "no_output", "Replicate returned no video output URL");
    }

    return {
      url: outputUrl,
      mimeType: "video/mp4",
      width,
      height,
      durationSeconds: params.duration ?? 5,
    };
  }

  private async pollForResult(predictionUrl: string, maxWaitMs = 300_000): Promise<string | null> {
    const start = Date.now();
    const interval = 5000;

    while (Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, interval));

      const res = await fetch(predictionUrl, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });
      if (!res.ok) continue;

      const pred = (await res.json()) as {
        output: string | string[] | null;
        status: string;
        error?: string;
      };

      if (pred.status === "succeeded" && pred.output) {
        return Array.isArray(pred.output) ? pred.output[0] : pred.output;
      }
      if (pred.status === "failed" || pred.status === "canceled") {
        throw new GenerationError(
          "replicate",
          "prediction_failed",
          `Video prediction failed: ${pred.error ?? pred.status}`,
        );
      }
    }

    throw new GenerationError("replicate", "timeout", "Video generation timed out waiting for Replicate");
  }
}
