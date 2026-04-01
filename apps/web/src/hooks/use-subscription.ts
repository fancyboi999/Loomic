"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getSubscription,
  cancelSubscription as apiCancelSubscription,
  changePlan as apiChangePlan,
  type SubscriptionStatus,
} from "@/lib/payments-api";

interface UseSubscriptionReturn {
  subscription: SubscriptionStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  cancel: () => Promise<void>;
  changePlan: (plan: string, billingPeriod: string) => Promise<void>;
}

export function useSubscription(): UseSubscriptionReturn {
  const { session } = useAuth();
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;

  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) return;
    try {
      const result = await getSubscription(token);
      setSubscription(result);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch subscription",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    refresh();
  }, [session?.access_token, refresh]);

  const cancel = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) throw new Error("Not authenticated");
    await apiCancelSubscription(token);
    await refresh();
  }, [refresh]);

  const changePlan = useCallback(
    async (plan: string, billingPeriod: string) => {
      const token = accessTokenRef.current;
      if (!token) throw new Error("Not authenticated");
      await apiChangePlan(token, plan, billingPeriod);
      await refresh();
    },
    [refresh],
  );

  return { subscription, loading, error, refresh, cancel, changePlan };
}
