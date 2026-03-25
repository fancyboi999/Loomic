"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoomicLogoInverted } from "../../components/icons/loomic-logo";
import { LoginForm } from "../../components/login-form";
import { LoadingScreen } from "../../components/loading-screen";
import { useAuth } from "../../lib/auth-context";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [user, loading, router]);

  if (loading || user) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen">
      {/* Left panel -- dark brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-black text-white flex-col justify-center px-16">
        <div className="flex items-center gap-4 mb-4">
          <LoomicLogoInverted className="size-14" />
          <h1 className="text-4xl font-bold tracking-tight">Loomic</h1>
        </div>
        <p className="text-lg text-neutral-400 mb-10">
          AI-powered creative workspace
        </p>
        <ul className="space-y-4 text-sm text-neutral-300">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 block h-1.5 w-1.5 rounded-full bg-white shrink-0" />
            Design and iterate with intelligent agents
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 block h-1.5 w-1.5 rounded-full bg-white shrink-0" />
            Organize projects in a unified workspace
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 block h-1.5 w-1.5 rounded-full bg-white shrink-0" />
            From concept to production, end to end
          </li>
        </ul>
      </div>

      {/* Right panel -- login form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12">
        <LoginForm />
      </div>
    </div>
  );
}
