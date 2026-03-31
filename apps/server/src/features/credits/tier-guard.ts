import type {
  BackgroundJobType,
  ImageQualityLevel,
  SubscriptionPlan,
} from "@loomic/shared";
import {
  canAccessModel,
  canUseResolution,
  getImageCreditCost,
  getVideoCreditCost,
  PLAN_CONFIGS,
} from "@loomic/shared";

import type { AdminSupabaseClient } from "../../supabase/admin.js";

// ── Error ────────────────────────────────────────────────────

export class TierGuardError extends Error {
  readonly statusCode: number;
  readonly code:
    | "model_not_accessible"
    | "resolution_not_allowed"
    | "concurrency_limit";

  constructor(
    code: TierGuardError["code"],
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "TierGuardError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ── Types ────────────────────────────────────────────────────

export type TierGuard = {
  checkModelAccess(plan: SubscriptionPlan, modelId: string): void;
  checkResolution(plan: SubscriptionPlan, quality: ImageQualityLevel): void;
  checkConcurrency(
    workspaceId: string,
    plan: SubscriptionPlan,
  ): Promise<void>;
  calculateCreditCost(
    modelId: string,
    jobType: BackgroundJobType,
    params?: { quality?: ImageQualityLevel; duration?: number },
  ): number;
};

// ── Factory ──────────────────────────────────────────────────

export function createTierGuard(options: {
  getAdminClient: () => AdminSupabaseClient;
}): TierGuard {
  return {
    checkModelAccess(plan, modelId) {
      if (!canAccessModel(plan, modelId)) {
        throw new TierGuardError(
          "model_not_accessible",
          `Your ${plan} plan does not have access to model "${modelId}". Please upgrade your plan.`,
          403,
        );
      }
    },

    checkResolution(plan, quality) {
      if (!canUseResolution(plan, quality)) {
        throw new TierGuardError(
          "resolution_not_allowed",
          `Your ${plan} plan does not allow "${quality}" quality. Maximum allowed: "${PLAN_CONFIGS[plan].maxResolution}".`,
          403,
        );
      }
    },

    async checkConcurrency(workspaceId, plan) {
      const admin = options.getAdminClient();
      const maxConcurrent = PLAN_CONFIGS[plan].maxConcurrentJobs;

      const { count, error } = await admin
        .from("background_jobs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .in("status", ["queued", "running"]);

      if (error) {
        // Log but don't block — fail open on query errors
        console.error(
          "[tier-guard] Failed to check concurrency:",
          error.message,
        );
        return;
      }

      const activeCount = count ?? 0;
      if (activeCount >= maxConcurrent) {
        throw new TierGuardError(
          "concurrency_limit",
          `Concurrent job limit reached (${activeCount}/${maxConcurrent}). Wait for a job to finish or upgrade your plan.`,
          429,
        );
      }
    },

    calculateCreditCost(modelId, jobType, params) {
      if (jobType === "image_generation") {
        const quality: ImageQualityLevel = params?.quality ?? "hd";
        return getImageCreditCost(modelId, quality);
      }
      // video_generation
      return getVideoCreditCost(modelId, params?.duration);
    },
  };
}
