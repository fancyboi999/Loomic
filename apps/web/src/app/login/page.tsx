"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { AuthShell } from "../../components/auth/auth-shell";
import { LoginForm } from "../../components/login-form";
import { LoadingScreen } from "../../components/loading-screen";
import { useAuth } from "../../lib/auth-context";

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_missing_code: "The sign-in link is incomplete. Request a new one and try again.",
  auth_exchange_failed: "This sign-in link could not be verified. Request a new one and try again.",
  viewer_bootstrap_failed: "Your account was verified, but we could not open your workspace. Please try again.",
  auth_callback_timeout: "Sign-in took too long to complete. Please try again.",
};

function LoginPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const initialErrorMessage = callbackError
    ? CALLBACK_ERROR_MESSAGES[callbackError] ??
      "Could not complete sign-in. Please try again."
    : null;

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [user, loading, router]);

  if (loading || user) return <LoadingScreen />;

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to continue where your workspace left off."
      features={[
        "Use password, magic link, or Google sign-in",
        "Keep your canvas and workspace state in one place",
        "Move from idea to delivery without switching tools",
      ]}
    >
      <LoginForm initialErrorMessage={initialErrorMessage} />
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginPageContent />
    </Suspense>
  );
}
