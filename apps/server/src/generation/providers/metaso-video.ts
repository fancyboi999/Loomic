import type {
  GeneratedVideo,
  VideoGenerateParams,
  VideoModelInfo,
  VideoProvider,
} from "../types.js";
import { GenerationError } from "../utils.js";

export const METASO_DEFAULT_BASE_URL = "https://metaso.cn/api/minimax/";
export const METASO_VIDEO_MODEL_ID = "metaso/minimax-h3";

const PROVIDER_NAME = "metaso";
const API_MODEL_ID = "MiniMax-H3";
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_MAX_WAIT_MS = 300_000;
const REQUEST_TIMEOUT_MS = 30_000;
const ALLOWED_RATIOS = new Set(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);

const METASO_VIDEO_MODELS: readonly VideoModelInfo[] = [
  {
    id: METASO_VIDEO_MODEL_ID,
    displayName: "MiniMax H3 (Metaso)",
    description:
      "MiniMax H3 via Metaso. Text-to-video and first/last-frame generation, 4–15s, 768P or 2K.",
    iconUrl: "/providers/metaso-logo.ico",
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      videoToVideo: false,
      audio: false,
    },
    limits: {
      maxDuration: 15,
      allowedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      maxResolution: "1080p",
      maxInputImages: 2,
    },
    pricing: {
      currency: "CNY",
      billingUnit: "generated_second",
      providerPointsName: "H3 points",
      evidenceDate: "2026-08-19",
      rates: [
        {
          resolution: "720p",
          displayResolution: "768P",
          providerPointsPerSecond: 10.2,
          cnyPerSecond: { min: 0.0897, max: 0.1102 },
        },
        {
          resolution: "1080p",
          displayResolution: "2K",
          providerPointsPerSecond: 17,
          cnyPerSecond: { min: 0.1496, max: 0.1836 },
        },
      ],
    },
  },
];

type FetchLike = typeof fetch;

export interface MetasoVideoProviderOptions {
  fetch?: FetchLike;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

type ApiErrorEnvelope = {
  error?: {
    type?: unknown;
    message?: unknown;
    http_code?: unknown;
  };
  request_id?: unknown;
};

type VideoTask = {
  id?: unknown;
  status?: unknown;
  content?: { url?: unknown } | null;
  error?: { code?: unknown; message?: unknown } | null;
  duration?: unknown;
  resolution?: unknown;
  ratio?: unknown;
  modality?: unknown;
};

export class MetasoVideoProvider implements VideoProvider {
  readonly name = PROVIDER_NAME;
  readonly models = METASO_VIDEO_MODELS;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly pollIntervalMs: number;
  private readonly maxWaitMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    apiKey: string,
    baseUrl = METASO_DEFAULT_BASE_URL,
    options: MetasoVideoProviderOptions = {},
  ) {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      throw new GenerationError(
        PROVIDER_NAME,
        "invalid_config",
        "Metaso API key is required",
      );
    }

    this.apiKey = normalizedKey;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchFn = options.fetch ?? fetch;
    this.pollIntervalMs = positiveInteger(
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      "pollIntervalMs",
    );
    this.maxWaitMs = positiveInteger(
      options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
      "maxWaitMs",
    );
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));
    this.now = options.now ?? Date.now;
  }

  async generate(params: VideoGenerateParams): Promise<GeneratedVideo> {
    const request = buildCreateRequest(params);
    const createResponse = await this.requestJson("v2/video_generation", {
      method: "POST",
      body: JSON.stringify(request),
    });
    const taskId = readRequiredString(createResponse, "task_id");

    return this.pollUntilComplete(taskId, {
      duration: request.duration,
      resolution: request.resolution,
      ratio: request.ratio,
    });
  }

  private async pollUntilComplete(
    taskId: string,
    request: { duration: number; resolution: "768P" | "2K"; ratio: string },
  ): Promise<GeneratedVideo> {
    const deadline = this.now() + this.maxWaitMs;
    let lastStatus: string | undefined;

    while (this.now() < deadline) {
      const response = await this.requestJson(
        `v2/query/video_generation/${encodeURIComponent(taskId)}`,
        { method: "GET" },
      );
      const task = readTask(response);
      const status = readRequiredString(task, "status");
      lastStatus = status;

      if (status === "succeeded") {
        if (task.modality != null && task.modality !== "video") {
          throw new GenerationError(
            PROVIDER_NAME,
            "malformed_response",
            "Metaso returned a non-video result for video generation",
          );
        }
        const outputUrl = readRequiredString(task.content, "url");
        validateOutputUrl(outputUrl);
        const duration = readOptionalInteger(task.duration) ?? request.duration;
        const resolution =
          task.resolution === "768P" || task.resolution === "2K"
            ? task.resolution
            : request.resolution;
        const ratio =
          typeof task.ratio === "string" && task.ratio
            ? task.ratio
            : request.ratio;
        const { width, height } = estimateDimensions(resolution, ratio);

        return {
          url: outputUrl,
          mimeType: "video/mp4",
          width,
          height,
          durationSeconds: duration,
        };
      }

      if (status === "failed") {
        const code =
          typeof task.error?.code === "string"
            ? sanitizeMessage(task.error.code)
            : "task_failed";
        const detail =
          typeof task.error?.message === "string"
            ? redactSensitiveValue(
                sanitizeMessage(task.error.message),
                this.apiKey,
              )
            : "Metaso video generation failed";
        throw new GenerationError(PROVIDER_NAME, code, detail);
      }

      if (status === "cancelled") {
        throw new GenerationError(
          PROVIDER_NAME,
          "cancelled",
          "Metaso video generation was cancelled",
        );
      }

      if (status !== "queued" && status !== "running") {
        throw new GenerationError(
          PROVIDER_NAME,
          "malformed_response",
          `Metaso returned an unknown task status: ${sanitizeMessage(status)}`,
        );
      }

      await this.sleep(this.pollIntervalMs);
    }

    if (lastStatus === "queued") {
      await this.cancelQueuedTask(taskId);
    }
    throw new GenerationError(
      PROVIDER_NAME,
      "timeout",
      `Metaso video generation timed out after ${Math.round(this.maxWaitMs / 1000)}s`,
    );
  }

  private async cancelQueuedTask(taskId: string): Promise<void> {
    try {
      await this.requestJson(
        `v2/video_generation/${encodeURIComponent(taskId)}`,
        {
          method: "DELETE",
        },
      );
    } catch {
      // Best effort only: the task may have started between the last poll and timeout.
    }
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
          ...init.headers,
        },
        signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const detail =
        error instanceof Error && error.name === "TimeoutError"
          ? "request timed out"
          : "request failed";
      throw new GenerationError(
        PROVIDER_NAME,
        "network_error",
        `Metaso ${detail}`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new GenerationError(
        PROVIDER_NAME,
        "malformed_response",
        `Metaso returned invalid JSON (HTTP ${response.status})`,
      );
    }

    if (!response.ok) {
      throw mapApiError(response.status, body, this.apiKey);
    }
    if (!isRecord(body)) {
      throw new GenerationError(
        PROVIDER_NAME,
        "malformed_response",
        "Metaso returned a non-object response",
      );
    }
    return body;
  }
}

function buildCreateRequest(params: VideoGenerateParams) {
  if (params.model !== METASO_VIDEO_MODEL_ID) {
    throw new GenerationError(
      PROVIDER_NAME,
      "model_not_found",
      `Unknown Metaso video model: ${params.model}`,
    );
  }

  const prompt = params.prompt.trim();
  if (!prompt || prompt.length > 7_000) {
    throw new GenerationError(
      PROVIDER_NAME,
      "invalid_input",
      "Metaso prompt must contain 1–7000 characters",
    );
  }

  const duration = params.duration ?? 5;
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
    throw new GenerationError(
      PROVIDER_NAME,
      "invalid_input",
      "Metaso duration must be an integer from 4 through 15 seconds",
    );
  }

  const resolution = mapResolution(params.resolution);
  const aspectRatio = params.aspectRatio ?? "16:9";
  if (!ALLOWED_RATIOS.has(aspectRatio)) {
    throw new GenerationError(
      PROVIDER_NAME,
      "invalid_input",
      `Metaso does not support aspect ratio ${sanitizeMessage(aspectRatio)}`,
    );
  }
  if (params.inputVideo) {
    throw new GenerationError(
      PROVIDER_NAME,
      "unsupported_input",
      "Metaso reference-video input is not exposed by this integration",
    );
  }
  if (params.enableAudio === true) {
    throw new GenerationError(
      PROVIDER_NAME,
      "unsupported_input",
      "Metaso audio generation is not supported by this integration",
    );
  }

  const images = params.inputImages ?? [];
  if (images.length > 2) {
    throw new GenerationError(
      PROVIDER_NAME,
      "invalid_input",
      "Metaso first/last-frame mode accepts at most two images",
    );
  }
  images.forEach(validateImageReference);

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: prompt },
  ];
  if (images[0]) {
    content.push({
      type: "image_url",
      image_url: { url: images[0] },
      role: "first_frame",
    });
  }
  if (images[1]) {
    content.push({
      type: "image_url",
      image_url: { url: images[1] },
      role: "last_frame",
    });
  }

  return {
    model: API_MODEL_ID,
    content,
    resolution,
    duration,
    ratio: images.length > 0 ? "adaptive" : aspectRatio,
  } as const;
}

function mapResolution(
  resolution: VideoGenerateParams["resolution"],
): "768P" | "2K" {
  if (resolution == null || resolution === "720p") return "768P";
  if (resolution === "1080p") return "2K";
  throw new GenerationError(
    PROVIDER_NAME,
    "invalid_input",
    `Metaso does not support resolution ${sanitizeMessage(String(resolution))}`,
  );
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new GenerationError(
      PROVIDER_NAME,
      "invalid_config",
      "Metaso base URL is invalid",
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new GenerationError(
      PROVIDER_NAME,
      "invalid_config",
      "Metaso base URL must use HTTP or HTTPS",
    );
  }
  parsed.search = "";
  parsed.hash = "";
  return `${parsed.toString().replace(/\/+$/, "")}/`;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new GenerationError(
      PROVIDER_NAME,
      "invalid_config",
      `${name} must be positive`,
    );
  }
  return value;
}

function validateImageReference(value: string): void {
  if (value.startsWith("mm_file://")) return;
  if (/^data:image\/(jpeg|jpg|png|webp|heic|heif);base64,/i.test(value)) return;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return;
  } catch {
    // Fall through to the normalized error below.
  }
  throw new GenerationError(
    PROVIDER_NAME,
    "invalid_input",
    "Metaso image inputs must be public HTTP(S) URLs, image data URIs, or mm_file references",
  );
}

function validateOutputUrl(value: string): void {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return;
  } catch {
    // Fall through to the normalized error below.
  }
  throw new GenerationError(
    PROVIDER_NAME,
    "malformed_response",
    "Metaso returned an invalid video URL",
  );
}

function readTask(value: Record<string, unknown>): VideoTask {
  if (!isRecord(value.task)) {
    throw new GenerationError(
      PROVIDER_NAME,
      "malformed_response",
      "Metaso query response is missing task",
    );
  }
  return value.task as VideoTask;
}

function readRequiredString(value: unknown, field: string): string {
  if (
    !isRecord(value) ||
    typeof value[field] !== "string" ||
    !value[field].trim()
  ) {
    throw new GenerationError(
      PROVIDER_NAME,
      "malformed_response",
      `Metaso response is missing ${field}`,
    );
  }
  return value[field].trim();
}

function readOptionalInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : undefined;
}

function mapApiError(
  status: number,
  body: unknown,
  sensitiveValue: string,
): GenerationError {
  const envelope = isRecord(body) ? (body as ApiErrorEnvelope) : undefined;
  const apiType =
    typeof envelope?.error?.type === "string"
      ? sanitizeMessage(envelope.error.type)
      : undefined;
  const apiMessage =
    typeof envelope?.error?.message === "string"
      ? redactSensitiveValue(
          sanitizeMessage(envelope.error.message),
          sensitiveValue,
        )
      : undefined;
  const requestId =
    typeof envelope?.request_id === "string"
      ? sanitizeMessage(envelope.request_id)
      : undefined;
  const code =
    apiType ??
    (
      {
        400: "bad_request_error",
        401: "authorized_error",
        402: "insufficient_balance_error",
        422: "unprocessable_entity_error",
        429: "rate_limit_error",
        500: "server_error",
        529: "overloaded_error",
      } as Record<number, string>
    )[status] ??
    "api_error";
  const detail = apiMessage ?? `Metaso API request failed with HTTP ${status}`;
  const suffix = requestId ? ` (request ${requestId})` : "";
  return new GenerationError(PROVIDER_NAME, code, `${detail}${suffix}`);
}

function redactSensitiveValue(value: string, sensitiveValue: string): string {
  return sensitiveValue
    ? value.replaceAll(sensitiveValue, "[redacted]")
    : value;
}

function estimateDimensions(
  resolution: "768P" | "2K",
  aspectRatio: string,
): { width: number; height: number } {
  const shortSide = resolution === "2K" ? 1_152 : 768;
  const [widthPart, heightPart] =
    aspectRatio === "adaptive" ? [16, 9] : aspectRatio.split(":").map(Number);
  if (!widthPart || !heightPart) return { width: shortSide, height: shortSide };
  const ratio = widthPart / heightPart;
  if (ratio >= 1) {
    return { width: Math.round(shortSide * ratio), height: shortSide };
  }
  return { width: shortSide, height: Math.round(shortSide / ratio) };
}

function sanitizeMessage(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").slice(0, 300);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
