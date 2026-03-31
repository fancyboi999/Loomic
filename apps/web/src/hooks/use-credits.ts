"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CreditBalanceResponse } from "@loomic/shared";
import { useAuth } from "@/lib/auth-context";
import { fetchCredits, claimDailyCredits } from "@/lib/credits-api";

interface UseCreditsReturn {
  balance: number;
  plan: string;
  dailyClaimed: boolean;
  limits: CreditBalanceResponse["limits"] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  claimDaily: () => Promise<boolean>;
}

export function useCredits(): UseCreditsReturn {
  const { session } = useAuth();
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;

  const [data, setData] = useState<CreditBalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) return;
    try {
      const result = await fetchCredits(token);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch credits");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    refresh();
  }, [session?.access_token, refresh]);

  // Auto-refresh on window focus
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refresh]);

  const claimDaily = useCallback(async (): Promise<boolean> => {
    const token = accessTokenRef.current;
    if (!token) return false;
    try {
      const result = await claimDailyCredits(token);
      if (result.success) {
        await refresh();
        return true;
      }
      setError(result.message ?? "Claim failed");
      return false;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to claim daily credits",
      );
      return false;
    }
  }, [refresh]);

  return {
    balance: data?.balance ?? 0,
    plan: data?.plan ?? "free",
    dailyClaimed: data?.dailyClaimed ?? false,
    limits: data?.limits ?? null,
    loading,
    error,
    refresh,
    claimDaily,
  };
}
