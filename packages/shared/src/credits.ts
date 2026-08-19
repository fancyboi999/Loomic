// @credits-system — Shared types, configs, and cost tables for the credits/billing system
import { z } from "zod";

// ── Plan types ───────────────────────────────────────────────

export const subscriptionPlanSchema = z.enum([
  "free",
  "starter",
  "pro",
  "ultra",
  "business",
]);
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;

export const billingPeriodSchema = z.enum(["monthly", "yearly"]);
export type BillingPeriod = z.infer<typeof billingPeriodSchema>;

export const creditTransactionTypeSchema = z.enum([
  "subscription_grant",
  "daily_grant",
  "purchase",
  "generation_deduct",
  "generation_refund",
  "admin_adjustment",
  "bonus",
]);
export type CreditTransactionType = z.infer<typeof creditTransactionTypeSchema>;

// ── Quality / resolution types ────────────────────────────────

export type ImageQualityLevel = "standard" | "hd" | "ultra";
export type VideoResolution = "720p" | "1080p" | "4k";

// ── Plan configuration ───────────────────────────────────────

export interface PlanConfig {
  /** Plan identifier */
  plan: SubscriptionPlan;
  /** Monthly subscription credits (0 for free — uses daily instead) */
  monthlyCredits: number;
  /** Daily free credits (only for free plan) */
  dailyCredits: number;
  /** Max concurrent generation jobs */
  maxConcurrentJobs: number;
  /** Max image quality tier */
  maxResolution: ImageQualityLevel;
  /** Max video resolution */
  maxVideoResolution: VideoResolution;
  /** Max projects allowed */
  maxProjects: number;
  /** Max brand kits allowed */
  maxBrandKits: number;
  /** Whether watermark is applied to generated content */
  watermark: boolean;
  /** Monthly price in USD */
  monthlyPrice: number;
  /** Yearly price per month in USD */
  yearlyPrice: number;
}

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  free: {
    plan: "free",
    monthlyCredits: 0,
    dailyCredits: 50,
    maxConcurrentJobs: 1,
    maxResolution: "standard",
    maxVideoResolution: "720p",
    maxProjects: 3,
    maxBrandKits: 1,
    watermark: true,
    monthlyPrice: 0,
    yearlyPrice: 0,
  },
  starter: {
    plan: "starter",
    monthlyCredits: 1200,
    dailyCredits: 0,
    maxConcurrentJobs: 2,
    maxResolution: "standard",
    maxVideoResolution: "720p",
    maxProjects: 10,
    maxBrandKits: 3,
    watermark: false,
    monthlyPrice: 12,
    yearlyPrice: 9,
  },
  pro: {
    plan: "pro",
    monthlyCredits: 5000,
    dailyCredits: 0,
    maxConcurrentJobs: 4,
    maxResolution: "hd",
    maxVideoResolution: "1080p",
    maxProjects: 50,
    maxBrandKits: 10,
    watermark: false,
    monthlyPrice: 39,
    yearlyPrice: 29,
  },
  ultra: {
    plan: "ultra",
    monthlyCredits: 15000,
    dailyCredits: 0,
    maxConcurrentJobs: 8,
    maxResolution: "ultra",
    maxVideoResolution: "4k",
    maxProjects: 200,
    maxBrandKits: 30,
    watermark: false,
    monthlyPrice: 99,
    yearlyPrice: 79,
  },
  business: {
    plan: "business",
    monthlyCredits: 50000,
    dailyCredits: 0,
    maxConcurrentJobs: 12,
    maxResolution: "ultra",
    maxVideoResolution: "4k",
    maxProjects: -1, // unlimited
    maxBrandKits: 100,
    watermark: false,
    monthlyPrice: 249,
    yearlyPrice: 199,
  },
};

// ── Model access tiers ───────────────────────────────────────

/**
 * Minimum plan required to use each model.
 * Models not listed here default to "pro" access.
 */
export const MODEL_MIN_TIER: Record<string, SubscriptionPlan> = {
  // ── Image models ──
  // Free tier (basic 3)
  "google-official/gemini-2.5-flash-image": "free",
  "google-official/gemini-3.1-flash-image-preview": "free",
  "google/nano-banana": "free",
  // Starter tier
  "google/nano-banana-pro": "starter",
  "google/nano-banana-2": "starter",
  "google/imagen-4": "starter",
  "openai/gpt-image-1.5": "starter",
  "black-forest-labs/flux-kontext-pro": "starter",
  "bytedance/seedream-5-lite": "starter",
  "bytedance/seedream-4.5": "starter",
  "bytedance/seedream-4": "starter",
  "recraft-ai/recraft-v3": "starter",
  // Pro tier
  "black-forest-labs/flux-kontext-max": "pro",

  // ── Video models ──
  // Starter tier (basic 2: Kling 2.6 + Wan 2.6)
  "kwaivgi/kling-v2.6": "starter",
  "wan-video/wan-2.6": "starter",
  "metaso/minimax-h3": "starter",
  // Pro tier
  "google-official/veo-3.1-generate-preview": "pro",
  // Google Vertex AI video models
  "google-vertex/veo-3.1-generate-001": "pro",
  "google-vertex/veo-3.1-fast-generate-001": "pro",
  "google-vertex/veo-3.1-lite-generate-001": "starter",
  "google-vertex/veo-3.0-generate-001": "pro",
  "google-vertex/veo-3.0-fast-generate-001": "pro",
  "google-vertex/veo-2.0-generate-001": "starter",
  "kwaivgi/kling-v3-video": "pro",
  "kwaivgi/kling-v3-omni-video": "pro",
  "kwaivgi/kling-o1": "pro",
  "bytedance/seedance-1.5-pro": "pro",
  "openai/sora-2": "pro",
  "openai/sora-2-pro": "ultra",
  "google/veo-3": "pro",
  "google/veo-3.1": "pro",
  "google/veo-3.1-fast": "pro",
  "minimax/hailuo-2.3": "starter",
};

const PLAN_ORDER: SubscriptionPlan[] = [
  "free",
  "starter",
  "pro",
  "ultra",
  "business",
];

/** Check if a given plan meets the minimum tier required for a model. */
export function canAccessModel(
  userPlan: SubscriptionPlan,
  modelId: string,
): boolean {
  const minTier = MODEL_MIN_TIER[modelId] ?? "pro";
  return PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(minTier);
}

/** Get the plan config for a given plan. */
export function getPlanConfig(plan: SubscriptionPlan): PlanConfig {
  return PLAN_CONFIGS[plan];
}

// ── Model credit costs ──────────────────────────────────────

export interface ImageModelCost {
  standard: number;
  hd: number;
  ultra: number;
}

export type VideoModelCost =
  | {
      calculation: "base_plus_duration";
      /** Credits covering the included duration at 720p. */
      base: number;
      includedSeconds: number;
      perAdditionalSecond: number;
      resolutionMultipliers: Partial<Record<VideoResolution, number>>;
    }
  | {
      calculation: "per_second";
      /** Credits charged for every generated second at each resolution. */
      rates: Partial<Record<VideoResolution, number>>;
    };

/**
 * Credit costs per image generation, by model and quality.
 * Models not listed default to { standard: 5, hd: 10, ultra: 20 }.
 */
export const IMAGE_MODEL_COSTS: Record<string, ImageModelCost> = {
  // Google Official
  "google-official/gemini-2.5-flash-image": {
    standard: 5,
    hd: 10,
    ultra: 20,
  },
  "google-official/gemini-3.1-flash-image-preview": {
    standard: 5,
    hd: 10,
    ultra: 20,
  },
  // Replicate — Google models
  "google/nano-banana-pro": { standard: 6, hd: 10, ultra: 18 },
  "google/nano-banana-2": { standard: 4, hd: 8, ultra: 12 },
  "google/nano-banana": { standard: 5, hd: 10, ultra: 20 },
  "google/imagen-4": { standard: 5, hd: 10, ultra: 20 },
  "google/imagen-3": { standard: 5, hd: 10, ultra: 20 },
  // Replicate — OpenAI
  "openai/gpt-image-1.5": { standard: 4, hd: 8, ultra: 16 },
  // Replicate — BFL
  "black-forest-labs/flux-kontext-pro": { standard: 8, hd: 12, ultra: 20 },
  "black-forest-labs/flux-kontext-max": { standard: 12, hd: 18, ultra: 30 },
  // Replicate — ByteDance
  "bytedance/seedream-5-lite": { standard: 3, hd: 6, ultra: 10 },
  "bytedance/seedream-4.5": { standard: 3, hd: 5, ultra: 8 },
  "bytedance/seedream-4": { standard: 2, hd: 4, ultra: 8 },
  // Replicate — Recraft
  "recraft-ai/recraft-v3": { standard: 5, hd: 10, ultra: 18 },
};

const DEFAULT_IMAGE_COST: ImageModelCost = {
  standard: 5,
  hd: 10,
  ultra: 20,
};

/**
 * Credit costs per video generation by model.
 * Base cost is for the cheapest configuration; actual cost scales with
 * duration and resolution.
 */
export const VIDEO_MODEL_COSTS: Record<string, VideoModelCost> = {
  // Google Official (direct API — supports higher resolutions than Replicate)
  "google-official/veo-3.1-generate-preview": basePlusDuration(80, 15, 2, 4),
  "google-official/veo-3.1-fast-generate-preview": basePlusDuration(
    60,
    10,
    2,
    4,
  ),
  "google-official/veo-3.1-lite-generate-preview": basePlusDuration(30, 5, 2),
  "google-official/veo-3.0-generate-001": basePlusDuration(70, 12, 2, 4),
  "google-official/veo-3.0-fast-generate-001": basePlusDuration(50, 8, 2, 4),
  "google-official/veo-2.0-generate-001": basePlusDuration(20, 3),
  // Google Vertex AI (same pricing as google-official equivalents)
  "google-vertex/veo-3.1-generate-001": basePlusDuration(80, 15, 2, 4),
  "google-vertex/veo-3.1-fast-generate-001": basePlusDuration(60, 10, 2, 4),
  "google-vertex/veo-3.1-lite-generate-001": basePlusDuration(30, 5, 2),
  "google-vertex/veo-3.0-generate-001": basePlusDuration(70, 12, 2, 4),
  "google-vertex/veo-3.0-fast-generate-001": basePlusDuration(50, 8, 2, 4),
  "google-vertex/veo-2.0-generate-001": basePlusDuration(20, 3),
  // Replicate — Kling
  "kwaivgi/kling-v3-video": basePlusDuration(50, 10),
  "kwaivgi/kling-v3-omni-video": basePlusDuration(40, 8),
  "kwaivgi/kling-v2.6": basePlusDuration(25, 5),
  "kwaivgi/kling-o1": basePlusDuration(30, 6),
  // Replicate — ByteDance
  "bytedance/seedance-1.5-pro": basePlusDuration(25, 5),
  // Replicate — Wan
  "wan-video/wan-2.6": basePlusDuration(25, 5),
  // Replicate — OpenAI
  "openai/sora-2": basePlusDuration(40),
  "openai/sora-2-pro": basePlusDuration(120),
  // Replicate — Google
  "google/veo-3": basePlusDuration(100),
  "google/veo-3.1": basePlusDuration(100),
  "google/veo-3.1-fast": basePlusDuration(40),
  // Replicate — MiniMax
  "minimax/hailuo-2.3": basePlusDuration(20, 4),
  // Metaso — provider H3 points are the Loomic credit meter for this model.
  "metaso/minimax-h3": {
    calculation: "per_second",
    rates: { "720p": 10.2, "1080p": 17 },
  },
};

const DEFAULT_VIDEO_COST: VideoModelCost = basePlusDuration(80);

/** Calculate the credit cost for an image generation. */
export function getImageCreditCost(
  modelId: string,
  quality: ImageQualityLevel = "hd",
): number {
  const costs = IMAGE_MODEL_COSTS[modelId] ?? DEFAULT_IMAGE_COST;
  return costs[quality];
}

/** Calculate the credit cost for a video generation. */
export function getVideoCreditCost(
  modelId: string,
  durationSeconds?: number,
  resolution?: VideoResolution,
): number {
  const rule = VIDEO_MODEL_COSTS[modelId] ?? DEFAULT_VIDEO_COST;
  const duration = durationSeconds ?? 5;
  const selectedResolution = resolution ?? "720p";
  if (!Number.isInteger(duration) || duration <= 0) {
    throw new RangeError("Video duration must be a positive integer");
  }

  let total: number;
  if (rule.calculation === "per_second") {
    const rate = rule.rates[selectedResolution];
    if (rate == null) {
      throw new RangeError(
        `No credit rate configured for ${modelId} at ${selectedResolution}`,
      );
    }
    total = duration * rate;
  } else {
    const additionalSeconds = Math.max(0, duration - rule.includedSeconds);
    total = rule.base + additionalSeconds * rule.perAdditionalSecond;
    total *= rule.resolutionMultipliers[selectedResolution] ?? 1;
  }

  // Credit balances are integer-valued. Always round up so fractional
  // provider rates never undercharge a generation.
  return Math.ceil(total);
}

function basePlusDuration(
  base: number,
  perAdditionalSecond = 0,
  multiplier1080p?: number,
  multiplier4k?: number,
): VideoModelCost {
  return {
    calculation: "base_plus_duration",
    base,
    includedSeconds: 5,
    perAdditionalSecond,
    resolutionMultipliers: {
      ...(multiplier1080p != null ? { "1080p": multiplier1080p } : {}),
      ...(multiplier4k != null ? { "4k": multiplier4k } : {}),
    },
  };
}

// ── Resolution guard ─────────────────────────────────────────

const RESOLUTION_ORDER: ImageQualityLevel[] = ["standard", "hd", "ultra"];

/** Check if a plan allows a given image quality level. */
export function canUseResolution(
  plan: SubscriptionPlan,
  quality: ImageQualityLevel,
): boolean {
  const config = PLAN_CONFIGS[plan];
  return (
    RESOLUTION_ORDER.indexOf(quality) <=
    RESOLUTION_ORDER.indexOf(config.maxResolution)
  );
}

const VIDEO_RESOLUTION_ORDER: VideoResolution[] = ["720p", "1080p", "4k"];

/** Check if a plan allows a given video resolution. */
export function canUseVideoResolution(
  plan: SubscriptionPlan,
  resolution: VideoResolution,
): boolean {
  const config = PLAN_CONFIGS[plan];
  return (
    VIDEO_RESOLUTION_ORDER.indexOf(resolution) <=
    VIDEO_RESOLUTION_ORDER.indexOf(config.maxVideoResolution)
  );
}

// ── API schemas ──────────────────────────────────────────────

export const creditBalanceResponseSchema = z.object({
  balance: z.number().int(),
  plan: subscriptionPlanSchema,
  dailyClaimed: z.boolean(),
  limits: z.object({
    maxConcurrentJobs: z.number().int(),
    maxResolution: z.string(),
    monthlyCredits: z.number().int(),
    dailyCredits: z.number().int(),
  }),
});
export type CreditBalanceResponse = z.infer<typeof creditBalanceResponseSchema>;

export const creditTransactionSchema = z.object({
  id: z.string().uuid(),
  transaction_type: creditTransactionTypeSchema,
  amount: z.number().int(),
  balance_after: z.number().int(),
  job_id: z.string().uuid().nullable(),
  description: z.string().nullable(),
  created_at: z.string(),
});
export type CreditTransaction = z.infer<typeof creditTransactionSchema>;

export const creditTransactionsResponseSchema = z.object({
  transactions: z.array(creditTransactionSchema),
});
export type CreditTransactionsResponse = z.infer<
  typeof creditTransactionsResponseSchema
>;

export const claimDailyResponseSchema = z.object({
  success: z.boolean(),
  balance: z.number().int().optional(),
  message: z.string().optional(),
});
export type ClaimDailyResponse = z.infer<typeof claimDailyResponseSchema>;

export const setPlanRequestSchema = z.object({
  plan: subscriptionPlanSchema,
});
export type SetPlanRequest = z.infer<typeof setPlanRequestSchema>;

// ── Annotated model (returned by model list APIs) ────────────

export const annotatedModelSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  iconUrl: z.string().optional(),
  provider: z.string(),
  accessible: z.boolean(),
  creditCost: z.number().int(),
  minTier: subscriptionPlanSchema,
  capabilities: z
    .object({
      textToVideo: z.boolean(),
      imageToVideo: z.boolean(),
      videoToVideo: z.boolean(),
      audio: z.boolean(),
    })
    .optional(),
  limits: z
    .object({
      maxDuration: z.number().int().positive(),
      allowedDurations: z.array(z.number().int().positive()).optional(),
      maxResolution: z.enum(["480p", "720p", "1080p", "2160p"]),
      maxInputImages: z.number().int().nonnegative(),
    })
    .optional(),
  pricing: z
    .object({
      currency: z.literal("CNY"),
      billingUnit: z.literal("generated_second"),
      providerPointsName: z.string(),
      evidenceDate: z.string(),
      rates: z.array(
        z.object({
          resolution: z.enum(["720p", "1080p"]),
          displayResolution: z.string(),
          providerPointsPerSecond: z.number().positive(),
          cnyPerSecond: z.object({
            min: z.number().nonnegative(),
            max: z.number().nonnegative(),
          }),
        }),
      ),
    })
    .optional(),
});
export type AnnotatedModel = z.infer<typeof annotatedModelSchema>;
