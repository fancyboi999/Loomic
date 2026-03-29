"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuthShell } from "../../components/auth/auth-shell";
import { LoadingScreen } from "../../components/loading-screen";
import { RegisterForm } from "../../components/register-form";
import { useAuth } from "../../lib/auth-context";

export default function RegisterPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [user, loading, router]);

  if (loading || user) return <LoadingScreen />;

  return (
    <AuthShell
      title="Create a workspace account"
      description="Register with email and password, then come back to the same canvas from any device."
      features={[
        "Create a dedicated account with email and password",
        "Return to your workspace after confirming your email",
        "Use the same workspace layout as signed-in users",
      ]}
    >
      <RegisterForm />
    </AuthShell>
  );
}
