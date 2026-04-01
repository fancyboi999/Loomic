import type { BillingPeriod, SubscriptionPlan } from "@loomic/shared";

import { getServerBaseUrl } from "./env";
import { ApiAuthError, ApiApplicationError } from "./server-api";

// ── Types ────────────────────────────────────────────────────

export type SubscriptionStatus = {
  plan: SubscriptionPlan;
  billingPeriod: BillingPeriod | null;
  status: string | null;
  lemonSqueezySubscriptionId: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  customerPortalUrl: string | null;
};

// ── Helpers ──────────────────────────────────────────────────

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function authJsonHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

async function handleErrorResponse(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new ApiAuthError();
  }
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? "application_error";
  const message = body?.error?.message ?? "Request failed";
  throw new ApiApplicationError(code, message);
}

// ── Payment APIs ─────────────────────────────────────────────

export async function createCheckout(
  accessToken: string,
  plan: string,
  billingPeriod: string,
): Promise<{ checkoutUrl: string }> {
  const response = await fetch(`${getServerBaseUrl()}/api/payments/checkout`, {
    method: "POST",
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify({ plan, billingPeriod }),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as { checkoutUrl: string };
}

export async function getSubscription(
  accessToken: string,
): Promise<SubscriptionStatus> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/payments/subscription`,
    { headers: authHeaders(accessToken) },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as SubscriptionStatus;
}

export async function cancelSubscription(
  accessToken: string,
): Promise<void> {
  const response = await fetch(`${getServerBaseUrl()}/api/payments/cancel`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  if (!response.ok) return handleErrorResponse(response);
}

export async function changePlan(
  accessToken: string,
  plan: string,
  billingPeriod: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/payments/change-plan`,
    {
      method: "POST",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify({ plan, billingPeriod }),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}
