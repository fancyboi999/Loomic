import type {
  CreditBalanceResponse,
  CreditTransactionsResponse,
  ClaimDailyResponse,
  SubscriptionPlan,
} from "@loomic/shared";

import { getServerBaseUrl } from "./env";
import { ApiAuthError, ApiApplicationError } from "./server-api";

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

// ── Credit APIs ──────────────────────────────────────────────

export async function fetchCredits(
  accessToken: string,
): Promise<CreditBalanceResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/credits`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as CreditBalanceResponse;
}

export async function fetchCreditTransactions(
  accessToken: string,
  limit = 20,
): Promise<CreditTransactionsResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/credits/transactions?limit=${limit}`,
    { headers: authHeaders(accessToken) },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as CreditTransactionsResponse;
}

export async function claimDailyCredits(
  accessToken: string,
): Promise<ClaimDailyResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/credits/claim-daily`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ClaimDailyResponse;
}

export async function adminSetPlan(
  accessToken: string,
  plan: SubscriptionPlan,
): Promise<CreditBalanceResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/credits/admin/set-plan`,
    {
      method: "POST",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify({ plan }),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as CreditBalanceResponse;
}
