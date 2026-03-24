"use client";

import { Suspense } from "react";

import { BrandKitPage } from "../../components/brand-kit/brand-kit-page";

export default function BrandKitRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] w-full items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <BrandKitPage />
    </Suspense>
  );
}
