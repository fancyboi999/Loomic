"use client";

import type {
  BrandKitSummary,
  BrandKitDetail,
  BrandKitAssetType,
} from "@loomic/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandKitSkeleton } from "../skeletons/brand-kit-skeleton";
import { useAuth } from "../../lib/auth-context";
import {
  createBrandKit,
  createBrandKitAsset,
  deleteBrandKit,
  deleteBrandKitAsset,
  duplicateBrandKit,
  fetchBrandKit,
  fetchBrandKits,
  updateBrandKit,
  updateBrandKitAsset,
  uploadBrandKitAsset,
} from "../../lib/brand-kit-api";
import { ApiAuthError } from "../../lib/server-api";
import { BrandKitEditor } from "./brand-kit-editor";
import { BrandKitSidebar } from "./brand-kit-sidebar";
import { EmptyState } from "./empty-state";

export function BrandKitPage() {
  const { session, signOut } = useAuth();

  const [kits, setKits] = useState<BrandKitSummary[]>([]);
  const [selectedKit, setSelectedKit] = useState<BrandKitDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Use refs for values that change on token refresh but shouldn't
  // trigger callback/effect cascades (root cause of tab-switch reloads).
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;
  const selectedKitRef = useRef(selectedKit);
  selectedKitRef.current = selectedKit;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const handleAuthError = useCallback(async (err: unknown) => {
    if (err instanceof ApiAuthError) {
      await signOutRef.current();
      return true;
    }
    return false;
  }, []);

  const getToken = useCallback(() => {
    const token = accessTokenRef.current;
    if (!token) throw new ApiAuthError();
    return token;
  }, []);

  // --- Data loading (ref-based, no dependency cascades) ---

  const loadKitDetail = useCallback(
    async (kitId: string) => {
      try {
        const detail = await fetchBrandKit(getToken(), kitId);
        setSelectedKit(detail);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to load brand kit detail:", err);
      }
    },
    [getToken, handleAuthError],
  );

  const refreshList = useCallback(async () => {
    try {
      const data = await fetchBrandKits(getToken());
      setKits(data.brandKits);
      return data.brandKits;
    } catch (err) {
      if (await handleAuthError(err)) return [];
      console.error("Failed to load brand kits:", err);
      return [];
    }
  }, [getToken, handleAuthError]);

  // Initial load — runs exactly once (workspace layout guarantees auth).
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    (async () => {
      setLoading(true);
      try {
        const data = await fetchBrandKits(getToken());
        setKits(data.brandKits);
        const firstKit = data.brandKits[0];
        if (firstKit) {
          const detail = await fetchBrandKit(getToken(), firstKit.id);
          setSelectedKit(detail);
        }
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to load brand kits:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken, handleAuthError]);

  // --- Kit handlers ---

  const handleSelectKit = useCallback(
    async (kitId: string) => {
      await loadKitDetail(kitId);
    },
    [loadKitDetail],
  );

  const handleCreateKit = useCallback(async () => {
    try {
      const newKit = await createBrandKit(getToken());
      await refreshList();
      setSelectedKit(newKit);
    } catch (err) {
      if (await handleAuthError(err)) return;
      console.error("Failed to create brand kit:", err);
    }
  }, [getToken, handleAuthError, refreshList]);

  const handleDuplicateKit = useCallback(async () => {
    const kit = selectedKitRef.current;
    if (!kit) return;
    try {
      const duplicated = await duplicateBrandKit(getToken(), kit.id);
      await refreshList();
      setSelectedKit(duplicated);
    } catch (err) {
      if (await handleAuthError(err)) return;
      console.error("Failed to duplicate brand kit:", err);
    }
  }, [getToken, handleAuthError, refreshList]);

  const handleUpdateKit = useCallback(
    async (data: {
      name?: string;
      guidance_text?: string | null;
      is_default?: boolean;
    }) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        const updated = await updateBrandKit(getToken(), kit.id, data);
        setSelectedKit(updated);
        await refreshList();
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to update brand kit:", err);
      }
    },
    [getToken, handleAuthError, refreshList],
  );

  const handleDeleteKit = useCallback(async () => {
    const kit = selectedKitRef.current;
    if (!kit) return;
    try {
      await deleteBrandKit(getToken(), kit.id);
      const remaining = await refreshList();
      const nextKit = remaining[0];
      if (nextKit) {
        await loadKitDetail(nextKit.id);
      } else {
        setSelectedKit(null);
      }
    } catch (err) {
      if (await handleAuthError(err)) return;
      console.error("Failed to delete brand kit:", err);
    }
  }, [getToken, handleAuthError, refreshList, loadKitDetail]);

  const handleDeleteKitFromSidebar = useCallback(
    async (kitId: string) => {
      try {
        await deleteBrandKit(getToken(), kitId);
        const remaining = await refreshList();
        if (selectedKitRef.current?.id === kitId) {
          const nextKit = remaining[0];
          if (nextKit) {
            await loadKitDetail(nextKit.id);
          } else {
            setSelectedKit(null);
          }
        }
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to delete brand kit:", err);
      }
    },
    [getToken, handleAuthError, refreshList, loadKitDetail],
  );

  // --- Asset handlers ---

  const handleAddAsset = useCallback(
    async (
      type: BrandKitAssetType,
      displayName: string,
      textContent?: string | null,
      metadata?: Record<string, unknown>,
    ) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await createBrandKitAsset(getToken(), kit.id, {
          asset_type: type,
          display_name: displayName,
          text_content: textContent ?? null,
          metadata,
        });
        await loadKitDetail(kit.id);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to create asset:", err);
      }
    },
    [getToken, handleAuthError, loadKitDetail],
  );

  const handleUpdateAsset = useCallback(
    async (
      assetId: string,
      data: { display_name?: string; text_content?: string | null },
    ) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await updateBrandKitAsset(getToken(), kit.id, assetId, data);
        await loadKitDetail(kit.id);
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to update asset:", err);
      }
    },
    [getToken, handleAuthError, loadKitDetail],
  );

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await deleteBrandKitAsset(getToken(), kit.id, assetId);
        await loadKitDetail(kit.id);
        await refreshList();
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to delete asset:", err);
      }
    },
    [getToken, handleAuthError, loadKitDetail, refreshList],
  );

  const handleUploadAsset = useCallback(
    async (type: "logo" | "image", file: File) => {
      const kit = selectedKitRef.current;
      if (!kit) return;
      try {
        await uploadBrandKitAsset(getToken(), kit.id, type, file);
        await loadKitDetail(kit.id);
        await refreshList();
      } catch (err) {
        if (await handleAuthError(err)) return;
        console.error("Failed to upload asset:", err);
      }
    },
    [getToken, handleAuthError, loadKitDetail, refreshList],
  );

  // --- Render ---

  if (loading) {
    return <BrandKitSkeleton />;
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
          onDuplicateKit={handleDuplicateKit}
          onAddAsset={handleAddAsset}
          onUpdateAsset={handleUpdateAsset}
          onDeleteAsset={handleDeleteAsset}
          onUploadAsset={handleUploadAsset}
        />
      ) : (
        <EmptyState onCreateKit={handleCreateKit} />
      )}
    </div>
  );
}
