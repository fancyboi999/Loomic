import type {
  CreditTransaction,
  SubscriptionPlan,
  BillingPeriod,
} from "@loomic/shared";
import { PLAN_CONFIGS } from "@loomic/shared";

import type { AdminSupabaseClient } from "../../supabase/admin.js";

// ── Error ────────────────────────────────────────────────────

export class CreditServiceError extends Error {
  readonly statusCode: number;
  readonly code:
    | "insufficient_credits"
    | "credit_query_failed"
    | "credit_claim_failed"
    | "credit_deduct_failed"
    | "credit_refund_failed"
    | "credit_plan_update_failed";

  constructor(
    code: CreditServiceError["code"],
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "CreditServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ── Types ────────────────────────────────────────────────────

export type BalanceInfo = {
  balance: number;
  plan: SubscriptionPlan;
  dailyClaimed: boolean;
};

export type SubscriptionInfo = {
  plan: SubscriptionPlan;
  billingPeriod: BillingPeriod | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
};

export type CreditService = {
  getBalance(workspaceId: string): Promise<BalanceInfo>;
  deductCredits(
    workspaceId: string,
    userId: string,
    amount: number,
    jobId: string,
    description?: string,
  ): Promise<string>;
  refundCredits(
    workspaceId: string,
    userId: string,
    amount: number,
    jobId: string,
    description?: string,
  ): Promise<string>;
  claimDailyCredits(
    workspaceId: string,
  ): Promise<{ success: boolean; balance?: number }>;
  getTransactions(
    workspaceId: string,
    limit?: number,
  ): Promise<CreditTransaction[]>;
  getSubscription(workspaceId: string): Promise<SubscriptionInfo>;
  updatePlan(workspaceId: string, plan: SubscriptionPlan): Promise<void>;
};

// ── Factory ──────────────────────────────────────────────────

export function createCreditService(options: {
  getAdminClient: () => AdminSupabaseClient;
}): CreditService {
  return {
    async getBalance(workspaceId) {
      const admin = options.getAdminClient();

      const [balanceResult, subscriptionResult, dailyClaimResult] =
        await Promise.all([
          admin
            .from("credit_balances")
            .select("balance")
            .eq("workspace_id", workspaceId)
            .maybeSingle(),
          admin
            .from("subscriptions")
            .select("plan")
            .eq("workspace_id", workspaceId)
            .maybeSingle(),
          admin
            .from("daily_credit_claims")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("claim_date", new Date().toISOString().slice(0, 10))
            .maybeSingle(),
        ]);

      if (balanceResult.error || subscriptionResult.error) {
        throw new CreditServiceError(
          "credit_query_failed",
          "Failed to query credit balance.",
          500,
        );
      }

      return {
        balance: balanceResult.data?.balance ?? 0,
        plan: (subscriptionResult.data?.plan as SubscriptionPlan) ?? "free",
        dailyClaimed: dailyClaimResult.data !== null,
      };
    },

    async deductCredits(workspaceId, userId, amount, jobId, description) {
      const admin = options.getAdminClient();

      const { data, error } = await admin.rpc("deduct_credits", {
        p_workspace_id: workspaceId,
        p_user_id: userId,
        p_amount: amount,
        p_job_id: jobId,
        p_description: description ?? null,
      });

      if (error) {
        if (error.message?.includes("INSUFFICIENT_CREDITS")) {
          throw new CreditServiceError(
            "insufficient_credits",
            "Not enough credits to perform this action.",
            402,
          );
        }
        throw new CreditServiceError(
          "credit_deduct_failed",
          `Failed to deduct credits: ${error.message}`,
          500,
        );
      }

      return data as string;
    },

    async refundCredits(workspaceId, userId, amount, jobId, description) {
      const admin = options.getAdminClient();

      const { data, error } = await admin.rpc("refund_credits", {
        p_workspace_id: workspaceId,
        p_user_id: userId,
        p_amount: amount,
        p_job_id: jobId,
        p_description: description ?? null,
      });

      if (error) {
        throw new CreditServiceError(
          "credit_refund_failed",
          `Failed to refund credits: ${error.message}`,
          500,
        );
      }

      return data as string;
    },

    async claimDailyCredits(workspaceId) {
      const admin = options.getAdminClient();

      // Determine the workspace's plan
      const { data: sub, error: subError } = await admin
        .from("subscriptions")
        .select("plan")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (subError) {
        throw new CreditServiceError(
          "credit_claim_failed",
          "Failed to query subscription.",
          500,
        );
      }

      const plan = (sub?.plan as SubscriptionPlan) ?? "free";
      const config = PLAN_CONFIGS[plan];

      if (config.dailyCredits <= 0) {
        return { success: false };
      }

      const { data: claimed, error: claimError } = await admin.rpc(
        "claim_daily_credits",
        {
          p_workspace_id: workspaceId,
          p_amount: config.dailyCredits,
        },
      );

      if (claimError) {
        throw new CreditServiceError(
          "credit_claim_failed",
          `Failed to claim daily credits: ${claimError.message}`,
          500,
        );
      }

      if (!claimed) {
        return { success: false };
      }

      // Fetch updated balance
      const { data: balanceRow } = await admin
        .from("credit_balances")
        .select("balance")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      return {
        success: true,
        balance: balanceRow?.balance ?? 0,
      };
    },

    async getTransactions(workspaceId, limit = 20) {
      const admin = options.getAdminClient();
      const safeLimit = Math.min(Math.max(limit, 1), 100);

      const { data, error } = await admin
        .from("credit_transactions")
        .select(
          "id, transaction_type, amount, balance_after, job_id, description, created_at",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(safeLimit);

      if (error) {
        throw new CreditServiceError(
          "credit_query_failed",
          "Failed to query transactions.",
          500,
        );
      }

      return (data ?? []) as CreditTransaction[];
    },

    async getSubscription(workspaceId) {
      const admin = options.getAdminClient();

      const { data, error } = await admin
        .from("subscriptions")
        .select(
          "plan, billing_period, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, canceled_at",
        )
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error) {
        throw new CreditServiceError(
          "credit_query_failed",
          "Failed to query subscription.",
          500,
        );
      }

      return {
        plan: (data?.plan as SubscriptionPlan) ?? "free",
        billingPeriod: (data?.billing_period as BillingPeriod) ?? null,
        stripeCustomerId: data?.stripe_customer_id ?? null,
        stripeSubscriptionId: data?.stripe_subscription_id ?? null,
        currentPeriodStart: data?.current_period_start ?? null,
        currentPeriodEnd: data?.current_period_end ?? null,
        canceledAt: data?.canceled_at ?? null,
      };
    },

    async updatePlan(workspaceId, plan) {
      const admin = options.getAdminClient();

      const { error } = await admin
        .from("subscriptions")
        .update({ plan, updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId);

      if (error) {
        throw new CreditServiceError(
          "credit_plan_update_failed",
          `Failed to update plan: ${error.message}`,
          500,
        );
      }

      // If the new plan has monthly credits, grant them
      const config = PLAN_CONFIGS[plan];
      if (config.monthlyCredits > 0) {
        const { data: balanceRow } = await admin
          .from("credit_balances")
          .select("balance, version")
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        if (balanceRow) {
          const newBalance =
            (balanceRow.balance ?? 0) + config.monthlyCredits;
          await admin
            .from("credit_balances")
            .update({
              balance: newBalance,
              version: (balanceRow.version ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", workspaceId);

          await admin.from("credit_transactions").insert({
            workspace_id: workspaceId,
            transaction_type: "subscription_grant",
            amount: config.monthlyCredits,
            balance_after: newBalance,
            description: `Plan upgraded to ${plan} — monthly credits granted`,
          });
        }
      }
    },
  };
}
