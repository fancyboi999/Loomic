"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAuth } from "../../../lib/auth-context";
import { LoadingScreen } from "../../../components/loading-screen";

export default function AuthCallbackPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const timedOut = useRef(false);

  // Redirect once session is resolved
  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace("/home");
    } else if (timedOut.current) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  // Timeout: if no session after 5s, redirect to login
  useEffect(() => {
    const timer = setTimeout(() => {
      timedOut.current = true;
      // Force a re-check — if still no user, the effect above redirects
      router.replace("/login");
    }, 5000);
    return () => clearTimeout(timer);
  }, [router]);

  return <LoadingScreen />;
}
