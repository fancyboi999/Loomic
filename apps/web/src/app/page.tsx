"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "../lib/auth-context";
import { LoadingScreen } from "../components/loading-screen";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/home" : "/login");
  }, [user, loading, router]);

  if (loading) {
    return <LoadingScreen />;
  }

  return null;
}
