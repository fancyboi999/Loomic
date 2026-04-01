"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Lock, Maximize2, Timer, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Toast config per error code
// ---------------------------------------------------------------------------

type TierLimitCode =
  | "concurrency_limit"
  | "model_not_accessible"
  | "resolution_not_allowed";

interface TierToastConfig {
  icon: ReactNode;
  accentClass: string; // Tailwind ring/bg/text color classes
  progressColor: string; // Tailwind bg for progress bar
  title: string;
  cta: string;
}

const TOAST_CONFIG: Record<TierLimitCode, TierToastConfig> = {
  concurrency_limit: {
    icon: <Timer className="h-5 w-5 text-amber-400" />,
    accentClass: "bg-amber-500/10",
    progressColor: "bg-amber-500",
    title: "\u5E76\u53D1\u4EFB\u52A1\u5DF2\u6EE1",
    cta: "\u5347\u7EA7\u5957\u9910",
  },
  model_not_accessible: {
    icon: <Lock className="h-5 w-5 text-violet-400" />,
    accentClass: "bg-violet-500/10",
    progressColor: "bg-violet-500",
    title: "\u6A21\u578B\u9700\u8981\u66F4\u9AD8\u7EA7\u5957\u9910",
    cta: "\u5347\u7EA7\u89E3\u9501",
  },
  resolution_not_allowed: {
    icon: <Maximize2 className="h-5 w-5 text-blue-400" />,
    accentClass: "bg-blue-500/10",
    progressColor: "bg-blue-500",
    title: "\u5206\u8FA8\u7387\u8D85\u51FA\u5957\u9910\u9650\u5236",
    cta: "\u5347\u7EA7\u5957\u9910",
  },
};

const VALID_CODES = new Set<string>(Object.keys(TOAST_CONFIG));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TierToast {
  id: number;
  code: TierLimitCode;
  message: string;
}

interface TierLimitToastContextValue {
  showTierLimit: (error: { code: string; message: string }) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TierLimitToastContext =
  createContext<TierLimitToastContextValue | null>(null);

let nextToastId = 0;
const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 5000;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TierLimitToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<TierToast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showTierLimit = useCallback(
    (error: { code: string; message: string }) => {
      if (!VALID_CODES.has(error.code)) return;
      const id = nextToastId++;
      setToasts((prev) => {
        const next = [...prev, { id, code: error.code as TierLimitCode, message: error.message }];
        // Keep only the most recent MAX_VISIBLE toasts
        return next.slice(-MAX_VISIBLE);
      });
    },
    [],
  );

  const ctx = useMemo<TierLimitToastContextValue>(
    () => ({ showTierLimit }),
    [showTierLimit],
  );

  return (
    <TierLimitToastContext.Provider value={ctx}>
      {children}
      <ToastPortal toasts={toasts} onDismiss={remove} />
    </TierLimitToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTierLimitToast(): TierLimitToastContextValue {
  const ctx = useContext(TierLimitToastContext);
  if (!ctx) {
    throw new Error("useTierLimitToast must be used within TierLimitToastProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Portal container (renders into document.body)
// ---------------------------------------------------------------------------

function ToastPortal({
  toasts,
  onDismiss,
}: {
  toasts: TierToast[];
  onDismiss: (id: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed right-4 top-4 z-[10000] flex flex-col gap-3">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <TierToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Single toast item
// ---------------------------------------------------------------------------

function TierToastItem({
  toast,
  onDismiss,
}: {
  toast: TierToast;
  onDismiss: () => void;
}) {
  const config = TOAST_CONFIG[toast.code];
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const startRef = useRef(Date.now());

  // Auto-dismiss with pause support
  useEffect(() => {
    if (paused) return;
    startRef.current = Date.now();
    const timer = setTimeout(onDismiss, remainingRef.current);
    return () => {
      remainingRef.current -= Date.now() - startRef.current;
      clearTimeout(timer);
    };
  }, [paused, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 80 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative w-[380px] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl"
    >
      <div className="p-4">
        {/* Header row: icon + title + close */}
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.accentClass}`}
          >
            {config.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">{config.title}</h4>
              <button
                type="button"
                onClick={onDismiss}
                className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">
              {toast.message}
            </p>
            {/* CTA row */}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onDismiss();
                  router.push("/pricing");
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 ${config.progressColor}`}
              >
                {config.cta}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
              >
                {"\u5173\u95ED"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <motion.div
        className={`absolute bottom-0 left-0 h-[2px] ${config.progressColor}`}
        initial={{ width: "100%" }}
        animate={paused ? {} : { width: "0%" }}
        transition={{
          duration: paused ? 0 : remainingRef.current / 1000,
          ease: "linear",
        }}
      />
    </motion.div>
  );
}
