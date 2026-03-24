"use client";

import type {
  BrandKitSummary,
  BrandKitDetail,
  BrandKitAssetType,
} from "@loomic/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "../../lib/auth-context";
import {
  createBrandKit,
  createBrandKitAsset,
  deleteBrandKit,
  deleteBrandKitAsset,
  fetchBrandKit,
  fetchBrandKits,
  updateBrandKit,
  updateBrandKitAsset,
} from "../../lib/brand-kit-api";
import { ApiAuthError } from "../../lib/server-api";
import { BrandKitEditor } from "./brand-kit-editor";
import { BrandKitSidebar } from "./brand-kit-sidebar";
import { EmptyState } from "./empty-state";

export function BrandKitPage() {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");

  const [kits, setKits] = useState<BrandKitSummary[]>([]);
  const [selectedKit, setSelectedKit] = useState<BrandKitDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const accessToken = session?.access_token;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const routerRef = useRef(router);
  routerRef.current = router;

  const handleAuthError = useCallback(async (err: unknown) => {
    if (err instanceof ApiAuthError) {
      await signOutRef.current();
      routerRef.current.replace("/login");
      return true;
    }
    return false;
  }, []);

  // Load a single kit detail
  const loadKitDetail = useCallback(
    async (kitId: string) => {
      if (!accessToken) return;
      try {
        const detail = await fetchBrandKit(accessToken, kitId);
        setSelectedKit(detail);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to load brand kit detail:", err);
      }
    },
    [accessToken, handleAuthError],
  );

  // Initial load
  const loadData = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);

    try {
      const data = await fetchBrandKits(accessToken);
      setKits(data.brandKits);

      // Select the requested kit, or the first one
      const firstKit = data.brandKits[0];
      if (firstKit) {
        const targetId =
          requestedId &&
          data.brandKits.find((k) => k.id === requestedId)
            ? requestedId
            : firstKit.id;
        await loadKitDetail(targetId);
      } else {
        setSelectedKit(null);
      }
    } catch (err) {
      if (await handleAuthError(err)) return;
      console.error("Failed to load brand kits:", err);
    } finally {
      setLoading(false);
    }
  }, [accessToken, requestedId, handleAuthError, loadKitDetail]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      routerRef.current.replace("/login");
      return;
    }
    loadData();
  }, [authLoading, user, loadData]);

  // --- Kit handlers ---

  const handleSelectKit = useCallback(
    async (kitId: string) => {
      await loadKitDetail(kitId);
      // Update URL without full navigation
      window.history.replaceState(null, "", `/brand-kit?id=${kitId}`);
    },
    [loadKitDetail],
  );

  const handleCreateKit = useCallback(async () => {
    if (!accessToken) return;
    try {
      const newKit = await createBrandKit(accessToken);
      // Refresh list
      const data = await fetchBrandKits(accessToken);
      setKits(data.brandKits);
      setSelectedKit(newKit);
      window.history.replaceState(null, "", `/brand-kit?id=${newKit.id}`);
    } catch (err) {
      if (await handleAuthError(err)) return;
      console.error("Failed to create brand kit:", err);
    }
  }, [accessToken, handleAuthError]);

  const handleUpdateKit = useCallback(
    async (data: {
      name?: string;
      guidance_text?: string | null;
      is_default?: boolean;
    }) => {
      if (!accessToken || !selectedKit) return;
      try {
        const updated = await updateBrandKit(
          accessToken,
          selectedKit.id,
          data,
        );
        setSelectedKit(updated);
        // Refresh list to reflect name / default changes
        const listData = await fetchBrandKits(accessToken);
        setKits(listData.brandKits);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to update brand kit:", err);
      }
    },
    [accessToken, selectedKit, handleAuthError],
  );

  const handleDeleteKit = useCallback(async () => {
    if (!accessToken || !selectedKit) return;
    try {
      await deleteBrandKit(accessToken, selectedKit.id);
      const data = await fetchBrandKits(accessToken);
      setKits(data.brandKits);

      const nextKit = data.brandKits[0];
      if (nextKit) {
        await loadKitDetail(nextKit.id);
        window.history.replaceState(
          null,
          "",
          `/brand-kit?id=${nextKit.id}`,
        );
      } else {
        setSelectedKit(null);
        window.history.replaceState(null, "", "/brand-kit");
      }
    } catch (err) {
      if (await handleAuthError(err)) return;
      console.error("Failed to delete brand kit:", err);
    }
  }, [accessToken, selectedKit, handleAuthError, loadKitDetail]);

  const handleDeleteKitFromSidebar = useCallback(
    async (kitId: string) => {
      if (!accessToken) return;
      try {
        await deleteBrandKit(accessToken, kitId);
        const data = await fetchBrandKits(accessToken);
        setKits(data.brandKits);

        // If the deleted kit was selected, select another
        if (selectedKit?.id === kitId) {
          const nextKit = data.brandKits[0];
          if (nextKit) {
            await loadKitDetail(nextKit.id);
            window.history.replaceState(
              null,
              "",
              `/brand-kit?id=${nextKit.id}`,
            );
          } else {
            setSelectedKit(null);
            window.history.replaceState(null, "", "/brand-kit");
          }
        }
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to delete brand kit:", err);
      }
    },
    [accessToken, selectedKit, handleAuthError, loadKitDetail],
  );

  // --- Asset handlers ---

  const handleAddAsset = useCallback(
    async (
      type: BrandKitAssetType,
      displayName: string,
      textContent?: string | null,
    ) => {
      if (!accessToken || !selectedKit) return;
      try {
        await createBrandKitAsset(accessToken, selectedKit.id, {
          asset_type: type,
          display_name: displayName,
          text_content: textContent ?? null,
        });
        // Reload the kit to get updated assets
        await loadKitDetail(selectedKit.id);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to create asset:", err);
      }
    },
    [accessToken, selectedKit, handleAuthError, loadKitDetail],
  );

  const handleUpdateAsset = useCallback(
    async (
      assetId: string,
      data: { display_name?: string; text_content?: string | null },
    ) => {
      if (!accessToken || !selectedKit) return;
      try {
        await updateBrandKitAsset(accessToken, selectedKit.id, assetId, data);
        await loadKitDetail(selectedKit.id);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to update asset:", err);
      }
    },
    [accessToken, selectedKit, handleAuthError, loadKitDetail],
  );

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      if (!accessToken || !selectedKit) return;
      try {
        await deleteBrandKitAsset(accessToken, selectedKit.id, assetId);
        await loadKitDetail(selectedKit.id);
        // Refresh sidebar counts
        const listData = await fetchBrandKits(accessToken);
        setKits(listData.brandKits);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to delete asset:", err);
      }
    },
    [accessToken, selectedKit, handleAuthError, loadKitDetail],
  );

  // --- Render ---

  if (authLoading || loading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full bg-background">
      <BrandKitSidebar
        kits={kits}
        selectedKitId={selectedKit?.id ?? null}
        onSelectKit={handleSelectKit}
        onCreateKit={handleCreateKit}
        onDeleteKit={handleDeleteKitFromSidebar}
      />

      {selectedKit ? (
        <BrandKitEditor
          kit={selectedKit}
          onUpdateKit={handleUpdateKit}
          onDeleteKit={handleDeleteKit}
          onAddAsset={handleAddAsset}
          onUpdateAsset={handleUpdateAsset}
          onDeleteAsset={handleDeleteAsset}
        />
      ) : (
        <EmptyState onCreateKit={handleCreateKit} />
      )}
    </div>
  );
}
