"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { LoadingScreen } from "../../../components/loading-screen";
import {
  ApiApplicationError,
  ApiAuthError,
  fetchViewer,
} from "../../../lib/server-api";
import { getSupabaseBrowserClient } from "../../../lib/supabase-browser";

const CALLBACK_TIMEOUT_MS = 5_000;

function loginErrorUrl(error: string): string {
  return `/login?${new URLSearchParams({ error }).toString()}`;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = searchParams.get("code");
    const providerError = searchParams.get("error");

    if (providerError) {
      router.replace(loginErrorUrl(providerError));
      return;
    }

    if (!code) {
      router.replace(loginErrorUrl("auth_callback_missing_code"));
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      cancelled = true;
      router.replace(loginErrorUrl("auth_callback_timeout"));
    }, CALLBACK_TIMEOUT_MS);

    void (async () => {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (cancelled) return;

        if (error || !data.session?.access_token) {
          router.replace(loginErrorUrl("auth_exchange_failed"));
          return;
        }

        try {
          await fetchViewer(data.session.access_token);
        } catch (viewerError) {
          if (
            viewerError instanceof ApiAuthError ||
            viewerError instanceof ApiApplicationError ||
            viewerError instanceof Error
          ) {
            router.replace(loginErrorUrl("viewer_bootstrap_failed"));
            return;
          }

          router.replace(loginErrorUrl("viewer_bootstrap_failed"));
          return;
        }

        if (!cancelled) {
          router.replace("/home");
        }
      } catch {
        if (!cancelled) {
          router.replace(loginErrorUrl("auth_exchange_failed"));
        }
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [router, searchParams]);

  return <LoadingScreen />;
}
