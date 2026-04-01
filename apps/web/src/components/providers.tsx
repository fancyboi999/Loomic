"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { AuthProvider } from "../lib/auth-context";
import { ToastProvider } from "./toast";
import { TierLimitToastProvider } from "./credits/tier-limit-toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <ToastProvider>
          <TierLimitToastProvider>{children}</TierLimitToastProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
