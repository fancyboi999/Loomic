/**
 * Thin HTTP client for the Lemon Squeezy JSON:API.
 *
 * Uses native `fetch()` — no SDK dependency.
 */

const BASE_URL = "https://api.lemonsqueezy.com/v1";

// ── Error ────────────────────────────────────────────────────

export class LemonSqueezyError extends Error {
  readonly statusCode: number;
  readonly apiErrors: unknown[];

  constructor(message: string, statusCode: number, apiErrors: unknown[] = []) {
    super(message);
    this.name = "LemonSqueezyError";
    this.statusCode = statusCode;
    this.apiErrors = apiErrors;
  }
}

// ── Types ────────────────────────────────────────────────────

export type LemonSqueezySubscription = {
  id: string;
  type: string;
  attributes: {
    store_id: number;
    customer_id: number;
    order_id: number;
    variant_id: number;
    status: string;
    renews_at: string | null;
    ends_at: string | null;
    cancelled: boolean;
    urls: {
      customer_portal: string;
      update_payment_method: string;
    };
    [key: string]: unknown;
  };
};

export type CheckoutResult = {
  checkoutUrl: string;
};

export type LemonSqueezyClient = {
  createCheckout(
    variantId: string,
    workspaceId: string,
    redirectUrl?: string,
  ): Promise<CheckoutResult>;

  getSubscription(
    subscriptionId: string,
  ): Promise<LemonSqueezySubscription>;

  updateSubscription(
    subscriptionId: string,
    attrs: Record<string, unknown>,
  ): Promise<LemonSqueezySubscription>;

  cancelSubscription(
    subscriptionId: string,
  ): Promise<LemonSqueezySubscription>;
};

// ── Factory ──────────────────────────────────────────────────

export function createLemonSqueezyClient(options: {
  apiKey: string;
  storeId: string;
}): LemonSqueezyClient {
  const { apiKey, storeId } = options;

  const headers = {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
    Authorization: `Bearer ${apiKey}`,
  };

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const json = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const errors = (json.errors ?? []) as unknown[];
      throw new LemonSqueezyError(
        `Lemon Squeezy API error: ${res.status} ${res.statusText}`,
        res.status,
        errors,
      );
    }

    return json as T;
  }

  return {
    async createCheckout(variantId, workspaceId, redirectUrl) {
      const payload = {
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              custom: {
                workspace_id: workspaceId,
              },
            },
            checkout_options: {
              embed: true,
            },
            ...(redirectUrl
              ? { product_options: { redirect_url: redirectUrl } }
              : {}),
          },
          relationships: {
            store: { data: { type: "stores", id: storeId } },
            variant: { data: { type: "variants", id: variantId } },
          },
        },
      };

      const result = await request<{
        data: { attributes: { url: string } };
      }>("POST", "/checkouts", payload);

      return { checkoutUrl: result.data.attributes.url };
    },

    async getSubscription(subscriptionId) {
      const result = await request<{
        data: LemonSqueezySubscription;
      }>("GET", `/subscriptions/${subscriptionId}`);

      return result.data;
    },

    async updateSubscription(subscriptionId, attrs) {
      const payload = {
        data: {
          type: "subscriptions",
          id: subscriptionId,
          attributes: attrs,
        },
      };

      const result = await request<{
        data: LemonSqueezySubscription;
      }>("PATCH", `/subscriptions/${subscriptionId}`, payload);

      return result.data;
    },

    async cancelSubscription(subscriptionId) {
      // DELETE cancels at period end; the subscription remains active until `ends_at`
      const result = await request<{
        data: LemonSqueezySubscription;
      }>("DELETE", `/subscriptions/${subscriptionId}`);

      return result.data;
    },
  };
}
