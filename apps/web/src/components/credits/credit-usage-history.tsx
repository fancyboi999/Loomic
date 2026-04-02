// @credits-system — Usage history table showing credit transactions
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Zap } from "lucide-react";
import type { CreditTransaction } from "@loomic/shared";

import { useAuth } from "@/lib/auth-context";
import { fetchCreditTransactions } from "@/lib/credits-api";

// ── Transaction type labels ──────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  subscription_grant: "Subscription Grant",
  daily_grant: "Daily Grant",
  purchase: "Purchase",
  generation_deduct: "Generation",
  generation_refund: "Refund",
  admin_adjustment: "Adjustment",
  bonus: "Bonus",
};

type FilterMode = "all" | "deducted" | "granted";

const FILTER_OPTIONS: Array<{ value: FilterMode; label: string }> = [
  { value: "all", label: "All" },
  { value: "deducted", label: "Deducted" },
  { value: "granted", label: "Granted" },
];

const DEDUCT_TYPES = new Set(["generation_deduct"]);
const GRANT_TYPES = new Set([
  "subscription_grant",
  "daily_grant",
  "purchase",
  "generation_refund",
  "admin_adjustment",
  "bonus",
]);

// ── Page size ────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Main component ───────────────────────────────────────────

export function CreditUsageHistory() {
  const { session } = useAuth();
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;

  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [hasMore, setHasMore] = useState(true);

  const loadTransactions = useCallback(async (limit: number) => {
    const token = accessTokenRef.current;
    if (!token) return;
    try {
      const result = await fetchCreditTransactions(token, limit);
      setTransactions(result.transactions);
      setHasMore(result.transactions.length >= limit);
    } catch {
      // Silently fail — user will see empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions(PAGE_SIZE);
  }, [loadTransactions]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const nextLimit = transactions.length + PAGE_SIZE;
    await loadTransactions(nextLimit);
    setLoadingMore(false);
  };

  // Filter transactions
  const filtered = transactions.filter((t) => {
    if (filter === "deducted") return DEDUCT_TYPES.has(t.transaction_type);
    if (filter === "granted") return GRANT_TYPES.has(t.transaction_type);
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading usage history...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Usage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          View your credit usage history and transactions.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="inline-flex gap-1 rounded-lg bg-neutral-100 p-1">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              filter === opt.value
                ? "bg-white font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Zap className="h-8 w-8 text-neutral-300" />
          <p className="text-sm text-muted-foreground">
            No transactions found.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-neutral-50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Credits</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, idx) => {
                const isGrant = !DEDUCT_TYPES.has(t.transaction_type);
                return (
                  <tr
                    key={t.id}
                    className={`border-b last:border-b-0 transition-colors hover:bg-neutral-50 ${
                      idx % 2 === 1 ? "bg-neutral-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-foreground">
                      {t.description ?? TYPE_LABELS[t.transaction_type] ?? t.transaction_type}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {TYPE_LABELS[t.transaction_type] ?? t.transaction_type}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span
                        className={
                          isGrant
                            ? "font-medium text-neutral-900"
                            : "font-medium text-red-500"
                        }
                      >
                        {isGrant ? "+" : ""}
                        {t.amount}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {hasMore && filtered.length > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
