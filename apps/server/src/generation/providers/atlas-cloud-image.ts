import type {
  GeneratedImage,
  ImageGenerateParams,
  ImageProvider,
  ModelInfo,
} from "../types.js";
import { GenerationError } from "../utils.js";

export const ATLAS_CLOUD_DEFAULT_BASE_URL = "https://api.atlascloud.ai/";
export const ATLAS_CLOUD_IMAGE_MODEL_ID = "bytedance/seedream-v5.0-lite";

const PROVIDER_NAME = "atlas-cloud";
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_MAX_WAIT_MS = 180_000;
const REQUEST_TIMEOUT_MS = 30_000;

const MODELS: readonly ModelInfo[] = [
  {
    id: ATLAS_CLOUD_IMAGE_MODEL_ID,
    displayName: "Seedream 5.0 Lite (Atlas Cloud)",
    description: "Seedream 5.0 Lite text-to-image generation via Atlas Cloud.",
  },
];

const SIZES: Record<string, Record<string, string>> = {
  standard: {
    "1:1": "2048*2048",
    "4:3": "2304*1728",
    "3:4": "1728*2304",
    "16:9": "2848*1600",
    "9:16": "1600*2848",
    "3:2": "2496*1664",
    "2:3": "1664*2496",
    "21:9": "3136*1344",
  },
  hd: {
    "1:1": "3072*3072",
    "4:3": "3456*2592",
    "3:4": "2592*3456",
    "16:9": "4096*2304",
    "9:16": "2304*4096",
    "3:2": "3744*2496",
    "2:3": "2496*3744",
    "21:9": "4704*2016",
  },
};

type FetchLike = typeof fetch;

export interface AtlasCloudImageProviderOptions {
  fetch?: FetchLike;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

export class AtlasCloudImageProvider implements ImageProvider {
  readonly name = PROVIDER_NAME;
  readonly models = MODELS;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly pollIntervalMs: number;
  private readonly maxWaitMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    apiKey: string,
    baseUrl = ATLAS_CLOUD_DEFAULT_BASE_URL,
    options: AtlasCloudImageProviderOptions = {},
  ) {
    this.apiKey = apiKey.trim();
    if (!this.apiKey) {
      throw new GenerationError(
        PROVIDER_NAME,
        "invalid_config",
        "Atlas Cloud API key is required",
      );
    }
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchFn = options.fetch ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    if (params.model !== ATLAS_CLOUD_IMAGE_MODEL_ID) {
      throw new GenerationError(
        PROVIDER_NAME,
        "model_not_found",
        `Unknown Atlas Cloud image model: ${params.model}`,
      );
    }
    const prompt = params.prompt.trim();
    if (!prompt) {
      throw new GenerationError(
        PROVIDER_NAME,
        "invalid_input",
        "Atlas Cloud prompt is required",
      );
    }
    if (params.inputImages?.length) {
      throw new GenerationError(
        PROVIDER_NAME,
        "unsupported_input",
        "This Atlas Cloud model supports text-to-image only",
      );
    }
    if (params.quality === "ultra") {
      throw new GenerationError(
        PROVIDER_NAME,
        "invalid_input",
        "Atlas Cloud Seedream 5.0 Lite supports standard or hd quality",
      );
    }
    if (params.outputFormat === "webp") {
      throw new GenerationError(
        PROVIDER_NAME,
        "invalid_input",
        "Atlas Cloud Seedream 5.0 Lite supports png or jpg output",
      );
    }

    const ratio = params.aspectRatio ?? "1:1";
    const quality = params.quality ?? "standard";
    const size = SIZES[quality]?.[ratio];
    if (!size) {
      throw new GenerationError(
        PROVIDER_NAME,
        "invalid_input",
        `Atlas Cloud does not support aspect ratio ${ratio}`,
      );
    }
    const outputFormat = params.outputFormat === "png" ? "png" : "jpeg";
    const created = await this.requestJson("api/v1/model/generateImage", {
      method: "POST",
      body: JSON.stringify({
        model: params.model,
        prompt,
        size,
        output_format: outputFormat,
      }),
    });
    const taskId = requiredString(unwrap(created), "id");
    const deadline = this.now() + this.maxWaitMs;

    while (this.now() < deadline) {
      const result = unwrap(
        await this.requestJson(
          `api/v1/model/result/${encodeURIComponent(taskId)}`,
          { method: "GET" },
        ),
      );
      const status = requiredString(result, "status");
      if (status === "completed") {
        const url = outputUrl(result.outputs);
        const [widthText, heightText] = size.split("*");
        const width = Number(widthText);
        const height = Number(heightText);
        return { url, mimeType: `image/${outputFormat}`, width, height };
      }
      if (status === "failed") {
        throw new GenerationError(
          PROVIDER_NAME,
          "task_failed",
          safeMessage(result.error, this.apiKey),
        );
      }
      if (status !== "created" && status !== "processing") {
        throw new GenerationError(
          PROVIDER_NAME,
          "malformed_response",
          `Atlas Cloud returned an unknown task status: ${status}`,
        );
      }
      await this.sleep(this.pollIntervalMs);
    }
    throw new GenerationError(
      PROVIDER_NAME,
      "timeout",
      "Atlas Cloud image generation timed out",
    );
  }

  private async requestJson(
    path: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetchFn(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.method === "POST"
            ? { "Content-Type": "application/json" }
            : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new GenerationError(
        PROVIDER_NAME,
        "network_error",
        "Atlas Cloud request failed",
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new GenerationError(
        PROVIDER_NAME,
        "malformed_response",
        `Atlas Cloud returned invalid JSON (HTTP ${response.status})`,
      );
    }
    if (!isRecord(body)) {
      throw new GenerationError(
        PROVIDER_NAME,
        "malformed_response",
        "Atlas Cloud returned a non-object response",
      );
    }
    if (!response.ok) {
      throw new GenerationError(
        PROVIDER_NAME,
        `http_${response.status}`,
        safeMessage(body.error, this.apiKey),
      );
    }
    return body;
  }
}

function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error();
    url.search = "";
    url.hash = "";
    return `${url.toString().replace(/\/+$/, "")}/`;
  } catch {
    throw new GenerationError(
      PROVIDER_NAME,
      "invalid_config",
      "Atlas Cloud base URL is invalid",
    );
  }
}

function unwrap(value: Record<string, unknown>): Record<string, unknown> {
  return isRecord(value.data) ? value.data : value;
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const result = value[field];
  if (typeof result !== "string" || !result.trim()) {
    throw new GenerationError(
      PROVIDER_NAME,
      "malformed_response",
      `Atlas Cloud response is missing ${field}`,
    );
  }
  return result.trim();
}

function outputUrl(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : undefined;
  const url =
    typeof first === "string"
      ? first
      : isRecord(first) && typeof first.url === "string"
        ? first.url
        : undefined;
  if (!url || !/^https?:\/\//.test(url)) {
    throw new GenerationError(
      PROVIDER_NAME,
      "malformed_response",
      "Atlas Cloud response is missing an image URL",
    );
  }
  return url;
}

function safeMessage(value: unknown, secret: string): string {
  const message =
    typeof value === "string"
      ? value
      : isRecord(value) && typeof value.message === "string"
        ? value.message
        : "Atlas Cloud request failed";
  return message.replaceAll(secret, "[redacted]").slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
