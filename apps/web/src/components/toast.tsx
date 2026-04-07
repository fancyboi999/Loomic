"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const TOAST_DURATION = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      // Use crypto.randomUUID() for collision-safe IDs across concurrent renders
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => remove(id), TOAST_DURATION);
    },
    [remove],
  );

  const ctx = useMemo<ToastContextValue>(
    () => ({
      toast: add,
      success: (msg) => add(msg, "success"),
      error: (msg) => add(msg, "error"),
    }),
    [add],
  );

  return (
    <ToastContext.Provider value={ctx}>
      {children}

      {/* Toast container — fixed bottom-center */}
      <div className="fixed bottom-6 left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => remove(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Toast item
// ---------------------------------------------------------------------------

const variantStyles: Record<ToastVariant, { bg: string; icon: ReactNode }> = {
  success: {
    bg: "bg-foreground text-background",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 shrink-0 text-success">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
      </svg>
    ),
  },
  error: {
    bg: "bg-foreground text-background",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 shrink-0 text-destructive">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM7.25 4.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5ZM8 11.5A.75.75 0 1 1 8 10a.75.75 0 0 1 0 1.5Z" />
      </svg>
    ),
  },
  info: {
    bg: "bg-foreground text-background",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 shrink-0 text-info">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM7.25 4.5a.75.75 0 0 1 1.5 0v.5a.75.75 0 0 1-1.5 0v-.5ZM6.75 7.75A.75.75 0 0 1 7.5 7h.25a.75.75 0 0 1 .75.75v3h.25a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5H7.5V8.5h-.25a.75.75 0 0 1-.75-.75Z" />
      </svg>
    ),
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { bg, icon } = variantStyles[toast.variant];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={onDismiss}
      className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm ${bg}`}
    >
      {icon}
      {toast.message}
    </motion.div>
  );
}
