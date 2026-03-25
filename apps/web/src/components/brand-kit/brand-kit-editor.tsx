"use client";

import type {
  BrandKitAsset,
  BrandKitDetail,
  BrandKitAssetType,
} from "@loomic/shared";
import { Copy, Ellipsis, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { ColorSection } from "./color-section";
import { FontSection } from "./font-section";
import { GuidanceSection } from "./guidance-section";
import { ImageSection } from "./image-section";
import { InlineInput } from "./inline-input";
import { LogoSection } from "./logo-section";

interface BrandKitEditorProps {
  kit: BrandKitDetail;
  onUpdateKit: (data: {
    name?: string;
    guidance_text?: string | null;
    is_default?: boolean;
  }) => void;
  onDeleteKit: () => void;
  onDuplicateKit: () => void;
  onAddAsset: (
    type: BrandKitAssetType,
    displayName: string,
    textContent?: string | null,
  ) => void;
  onUpdateAsset: (
    assetId: string,
    data: { display_name?: string; text_content?: string | null },
  ) => void;
  onDeleteAsset: (assetId: string) => void;
  onUploadAsset: (type: "logo" | "image", file: File) => void;
}

function filterAssets(
  assets: BrandKitAsset[],
  type: BrandKitAssetType,
): BrandKitAsset[] {
  return assets.filter((a) => a.asset_type === type);
}

export function BrandKitEditor({
  kit,
  onUpdateKit,
  onDeleteKit,
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
  onDuplicateKit,
  onUploadAsset,
}: BrandKitEditorProps) {
  const colors = useMemo(() => filterAssets(kit.assets, "color"), [kit.assets]);
  const fonts = useMemo(() => filterAssets(kit.assets, "font"), [kit.assets]);
  const logos = useMemo(() => filterAssets(kit.assets, "logo"), [kit.assets]);
  const images = useMemo(() => filterAssets(kit.assets, "image"), [kit.assets]);

  const handleNameCommit = useCallback(
    (name: string) => onUpdateKit({ name }),
    [onUpdateKit],
  );

  const handleGuidanceSave = useCallback(
    (text: string | null) => onUpdateKit({ guidance_text: text }),
    [onUpdateKit],
  );

  const handleToggleDefault = useCallback(() => {
    onUpdateKit({ is_default: !kit.is_default });
  }, [kit.is_default, onUpdateKit]);

  // Color handlers
  const handleAddColor = useCallback(
    (name: string, hex: string) => onAddAsset("color", name, hex),
    [onAddAsset],
  );
  const handleUpdateColor = useCallback(
    (assetId: string, name: string, hex: string) =>
      onUpdateAsset(assetId, { display_name: name, text_content: hex }),
    [onUpdateAsset],
  );
  const handleUpdateColorLabel = useCallback(
    (assetId: string, name: string) =>
      onUpdateAsset(assetId, { display_name: name }),
    [onUpdateAsset],
  );

  // Font handlers
  const handleAddFont = useCallback(
    (name: string) => onAddAsset("font", name),
    [onAddAsset],
  );
  const handleUpdateFontLabel = useCallback(
    (assetId: string, name: string) =>
      onUpdateAsset(assetId, { display_name: name }),
    [onUpdateAsset],
  );

  // Logo/Image label handlers
  const handleUpdateLogoLabel = useCallback(
    (assetId: string, name: string) =>
      onUpdateAsset(assetId, { display_name: name }),
    [onUpdateAsset],
  );
  const handleUpdateImageLabel = useCallback(
    (assetId: string, name: string) =>
      onUpdateAsset(assetId, { display_name: name }),
    [onUpdateAsset],
  );

  // Upload handlers
  const handleUploadLogo = useCallback(
    (file: File) => onUploadAsset("logo", file),
    [onUploadAsset],
  );
  const handleUploadImage = useCallback(
    (file: File) => onUploadAsset("image", file),
    [onUploadAsset],
  );

  return (
    <div className="flex flex-1 flex-col min-w-0">
      {/* Header */}
      <header className="flex h-[96px] shrink-0 items-center justify-between border-b px-6">
        <InlineInput
          value={kit.name}
          onCommit={handleNameCommit}
          placeholder="Kit name"
          inputClassName="text-2xl font-semibold text-foreground"
        />

        <div className="flex items-center gap-3 shrink-0 ml-4">
          {/* Apply to new projects toggle */}
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            应用到新项目
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={kit.is_default}
            onClick={handleToggleDefault}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer",
              kit.is_default ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                kit.is_default ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>

          {/* Divider */}
          <div className="h-5 w-px bg-border" />

          {/* More menu */}
          <MoreMenu
            onDuplicate={onDuplicateKit}
            onDelete={onDeleteKit}
          />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 md:px-[80px] xl:px-[160px]">
        <div className="flex flex-col gap-8 max-w-[960px] mx-auto">
          {/* Extract from URL — disabled Phase 1 */}
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 self-start rounded-xl border border-dashed px-4 py-2.5 text-sm text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <Sparkles className="h-4 w-4" />
            Extract from URL
          </button>

          <GuidanceSection
            value={kit.guidance_text}
            onSave={handleGuidanceSave}
          />

          <LogoSection
            logos={logos}
            onDelete={onDeleteAsset}
            onUpdateLabel={handleUpdateLogoLabel}
            onUpload={handleUploadLogo}
          />

          <ColorSection
            colors={colors}
            onAddColor={handleAddColor}
            onUpdateColor={handleUpdateColor}
            onDeleteColor={onDeleteAsset}
            onUpdateLabel={handleUpdateColorLabel}
          />

          <FontSection
            fonts={fonts}
            onAddFont={handleAddFont}
            onDeleteFont={onDeleteAsset}
            onUpdateLabel={handleUpdateFontLabel}
          />

          <ImageSection
            images={images}
            onDelete={onDeleteAsset}
            onUpdateLabel={handleUpdateImageLabel}
            onUpload={handleUploadImage}
          />
        </div>
      </div>
    </div>
  );
}

// --- More menu (⋯) dropdown ---

function MoreMenu({
  onDuplicate,
  onDelete,
}: {
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg p-2 text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
        aria-label="More actions"
      >
        <Ellipsis className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-[140px] rounded-xl border bg-popover p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onDuplicate();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <Copy className="h-4 w-4 text-muted-foreground" />
            复制
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        </div>
      )}
    </div>
  );
}
