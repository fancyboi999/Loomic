import type { GeneratedVideo, VideoGenerateParams, VideoProvider } from "../types.js";
import { GenerationError } from "../utils.js";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

export class VolcesVideoProvider implements VideoProvider {
  readonly name = "volces";
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.baseURL = baseURL ?? DEFAULT_BASE_URL;
  }

  async generate(params: VideoGenerateParams): Promise<GeneratedVideo> {
    const resolution = RESOLUTION_MAP[params.resolution ?? "720p"] ?? RESOLUTION_MAP["720p"];
    const duration = params.duration ?? 5;

    const body = {
      model: params.model,
      prompt: params.prompt,
      size: `${resolution.width}x${resolution.height}`,
      duration,
      ...(params.inputImages?.length ? { image: params.inputImages[0] } : {}),
    };

    const response = await fetch(`${this.baseURL}/video/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new GenerationError(
        "volces",
        "api_error",
        `Volces video API error ${response.status}: ${(errorBody as { error?: { message?: string } })?.error?.message ?? "Unknown error"}`,
      );
    }

    const data = (await response.json()) as { data: Array<{ url?: string }> };
    const url = data.data[0]?.url;

    if (!url) {
      throw new GenerationError("volces", "no_output", "Volces returned no video URL");
    }

    return {
      url,
      mimeType: "video/mp4",
      width: resolution.width,
      height: resolution.height,
      durationSeconds: duration,
    };
  }
}
