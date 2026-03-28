import type { GeneratedImage, ImageGenerateParams, ImageProvider, ModelInfo } from "../types.js";
import { aspectRatioToDimensions, GenerationError } from "../utils.js";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

/**
 * Image input parameter mapping per model.
 *
 * Replicate models use different parameter names for image input:
 * - `input_image`  (single URL string)  → Flux Kontext family
 * - `input_images` (array of URL strings) → OpenAI GPT Image
 * - `image_input`  (array of URL strings) → Google Nano Banana, ByteDance Seedream (default)
 */
const SINGLE_IMAGE_INPUT_MODELS = new Set([
  "black-forest-labs/flux-kontext-pro",
  "black-forest-labs/flux-kontext-max",
  "black-forest-labs/flux-1.1-pro",
  "black-forest-labs/flux-pro",
]);

const INPUT_IMAGES_MODELS = new Set([
  "openai/gpt-image-1.5",
  "openai/gpt-image-1",
]);

/**
 * Models that don't support any image input.
 */
const TEXT_ONLY_MODELS = new Set([
  "google/imagen-4",
  "google/imagen-3",
  "recraft-ai/recraft-v3",
]);

/**
 * Recraft uses `size` (e.g. "1024x1024") instead of `aspect_ratio`.
 */
const RECRAFT_MODELS = new Set(["recraft-ai/recraft-v3"]);

const ICON_GOOGLE = "https://tjzk.replicate.delivery/models_organizations_avatar/27e1e3fe-f766-4748-83b3-777bc282d8dd/1342004.png";
const ICON_OPENAI = "https://github.com/openai.png";
const ICON_BFL = "https://tjzk.replicate.delivery/models_organizations_avatar/01ed70be-0d47-4a4a-85fb-32c02cdd4ab5/bfl.png";
const ICON_BYTEDANCE = "https://github.com/bytedance.png";
const ICON_RECRAFT = "https://github.com/recraft-ai.png";

const REPLICATE_IMAGE_MODELS: readonly ModelInfo[] = [
  // Google
  {
    id: "google/nano-banana-pro",
    displayName: "Nano Banana Pro",
    description: "Google's SOTA image generation & editing model. Supports up to 14 reference images, up to 4K resolution.",
    iconUrl: ICON_GOOGLE,
  },
  {
    id: "google/nano-banana-2",
    displayName: "Nano Banana 2",
    description: "Fast image generation with conversational editing, multi-image fusion, and character consistency.",
    iconUrl: ICON_GOOGLE,
  },
  {
    id: "google/nano-banana",
    displayName: "Nano Banana",
    description: "Google's image editing model in Gemini 2.5. Best for editing & transformation tasks.",
    iconUrl: ICON_GOOGLE,
  },
  {
    id: "google/imagen-4",
    displayName: "Imagen 4",
    description: "Google's Imagen 4 flagship text-to-image model. Generation only, no image input.",
    iconUrl: ICON_GOOGLE,
  },
  // OpenAI
  {
    id: "openai/gpt-image-1.5",
    displayName: "GPT Image 1.5",
    description: "OpenAI's latest image model with better instruction following. Supports image input, background transparency, and multiple outputs.",
    iconUrl: ICON_OPENAI,
  },
  // Black Forest Labs
  {
    id: "black-forest-labs/flux-kontext-max",
    displayName: "Flux Kontext Max",
    description: "Premium text-based image editing with maximum performance and improved typography generation. Single image input.",
    iconUrl: ICON_BFL,
  },
  {
    id: "black-forest-labs/flux-kontext-pro",
    displayName: "Flux Kontext Pro",
    description: "SOTA text-based image editing with excellent prompt following and consistent results. Single image input.",
    iconUrl: ICON_BFL,
  },
  // ByteDance
  {
    id: "bytedance/seedream-5-lite",
    displayName: "Seedream 5.0 Lite",
    description: "Image generation with built-in reasoning, example-based editing, and deep domain knowledge. Up to 3K resolution.",
    iconUrl: ICON_BYTEDANCE,
  },
  {
    id: "bytedance/seedream-4.5",
    displayName: "Seedream 4.5",
    description: "Upgraded ByteDance model with stronger spatial understanding and world knowledge. Up to 4K resolution.",
    iconUrl: ICON_BYTEDANCE,
  },
  {
    id: "bytedance/seedream-4",
    displayName: "Seedream 4",
    description: "Unified text-to-image generation and precise single-sentence editing at up to 4K resolution.",
    iconUrl: ICON_BYTEDANCE,
  },
  // Recraft
  {
    id: "recraft-ai/recraft-v3",
    displayName: "Recraft V3",
    description: "SOTA text-to-image with long text rendering and wide style variety. No image input. Proven #1 by Artificial Analysis benchmark.",
    iconUrl: ICON_RECRAFT,
  },
];

// ── Quality → model-specific resolution translation ──────────────────────

type QualityMap = Record<string, Record<string, { param: string; value: string }>>;

/**
 * Maps (model prefix → quality level → { paramName, paramValue }).
 * Lookup order: exact model ID → prefix before "/" → fallback.
 */
const QUALITY_MAP: QualityMap = {
  // Google Nano Banana Pro / 2: uses `resolution`
  "google/nano-banana-pro": {
    standard: { param: "resolution", value: "1K" },
    hd:       { param: "resolution", value: "2K" },
    ultra:    { param: "resolution", value: "4K" },
  },
  "google/nano-banana-2": {
    standard: { param: "resolution", value: "1K" },
    hd:       { param: "resolution", value: "2K" },
    ultra:    { param: "resolution", value: "4K" },
  },
  // Google Imagen 4: uses `image_size`
  "google/imagen-4": {
    standard: { param: "image_size", value: "1K" },
    hd:       { param: "image_size", value: "2K" },
    ultra:    { param: "image_size", value: "2K" }, // max 2K, cap silently
  },
  // ByteDance Seedream 5 Lite: uses `size`, max 3K
  "bytedance/seedream-5-lite": {
    standard: { param: "size", value: "2K" },
    hd:       { param: "size", value: "2K" },
    ultra:    { param: "size", value: "3K" },
  },
  // ByteDance Seedream 4.5: uses `size`, max 4K
  "bytedance/seedream-4.5": {
    standard: { param: "size", value: "2K" },
    hd:       { param: "size", value: "2K" },
    ultra:    { param: "size", value: "4K" },
  },
  // ByteDance Seedream 4: uses `size`, max 4K
  "bytedance/seedream-4": {
    standard: { param: "size", value: "1K" },
    hd:       { param: "size", value: "2K" },
    ultra:    { param: "size", value: "4K" },
  },
};

/** GPT Image 1.5 quality mapping (native `quality` param) */
const GPT_IMAGE_QUALITY: Record<string, string> = {
  standard: "medium",
  hd: "high",
  ultra: "high",
};

function applyQuality(
  input: Record<string, unknown>,
  model: string,
  quality: string | undefined,
): void {
  if (!quality) return;

  // GPT Image has native `quality` param
  if (INPUT_IMAGES_MODELS.has(model)) {
    input.quality = GPT_IMAGE_QUALITY[quality] ?? "auto";
    return;
  }

  // Lookup quality translation for this model
  const modelMap = QUALITY_MAP[model];
  if (modelMap) {
    const entry = modelMap[quality];
    if (entry) {
      input[entry.param] = entry.value;
    }
  }
  // Models not in QUALITY_MAP (Flux, Nano Banana, Recraft): no resolution param, skip
}

// ── Aspect ratio normalization ────────────────────────────────────────────

/**
 * Models with restricted aspect_ratio support.
 * Models NOT listed here accept all ratios the tool exposes.
 */
const MODEL_ASPECT_RATIOS: Record<string, string[]> = {
  "openai/gpt-image-1.5": ["1:1", "3:2", "2:3"],
  "openai/gpt-image-1":   ["1:1", "3:2", "2:3"],
};

function parseRatio(ratio: string): number {
  const [w, h] = ratio.split(":").map(Number);
  return (w && h) ? w / h : 1;
}

/**
 * If the model doesn't support the requested ratio, find the nearest one.
 * e.g. "16:9" (1.78) → "3:2" (1.5) for GPT Image.
 */
function normalizeAspectRatio(model: string, ratio: string): string {
  const supported = MODEL_ASPECT_RATIOS[model];
  if (!supported || supported.includes(ratio)) return ratio;

  const target = parseRatio(ratio);
  let best = supported[0]!;
  let bestDiff = Math.abs(parseRatio(best) - target);

  for (const candidate of supported) {
    const diff = Math.abs(parseRatio(candidate) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }
  return best;
}

// ── Output format translation ────────────────────────────────────────────

/** Models that don't accept output_format */
const NO_OUTPUT_FORMAT_MODELS = new Set([
  "bytedance/seedream-4.5",
  "bytedance/seedream-4",
  "recraft-ai/recraft-v3",
]);

function applyOutputFormat(
  input: Record<string, unknown>,
  model: string,
  format: string | undefined,
): void {
  if (!format || NO_OUTPUT_FORMAT_MODELS.has(model)) return;
  input.output_format = format;
}

// ── Provider implementation ──────────────────────────────────────────────

export class ReplicateImageProvider implements ImageProvider {
  readonly name = "replicate";
  readonly models = REPLICATE_IMAGE_MODELS;
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const rawRatio = params.aspectRatio ?? "1:1";
    const aspectRatio = normalizeAspectRatio(params.model, rawRatio);
    const { width, height } = aspectRatioToDimensions(aspectRatio);

    const input: Record<string, unknown> = {
      prompt: params.prompt,
    };

    // Aspect ratio / size — Recraft uses pixel `size`, others use `aspect_ratio`
    if (RECRAFT_MODELS.has(params.model)) {
      input.size = `${width}x${height}`;
    } else {
      input.aspect_ratio = aspectRatio;
    }

    // Image input — parameter name varies by model
    if (params.inputImages?.length && !TEXT_ONLY_MODELS.has(params.model)) {
      if (SINGLE_IMAGE_INPUT_MODELS.has(params.model)) {
        input.input_image = params.inputImages[0];
      } else if (INPUT_IMAGES_MODELS.has(params.model)) {
        input.input_images = params.inputImages;
      } else {
        input.image_input = params.inputImages;
      }
    }

    // Semantic params → model-specific translation
    applyQuality(input, params.model, params.quality);
    applyOutputFormat(input, params.model, params.outputFormat);

    const response = await fetch(
      `${REPLICATE_API_BASE}/models/${params.model}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          Prefer: "wait",
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
      output: string[] | string;
      status: string;
    };
    const outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;

    if (!outputUrl) {
      throw new GenerationError(
        "replicate",
        "no_output",
        "Replicate returned no output URL",
      );
    }

    const mimeType = params.outputFormat === "jpg" ? "image/jpeg"
      : params.outputFormat === "webp" ? "image/webp"
      : "image/png";

    return { url: outputUrl, mimeType, width, height };
  }
}
