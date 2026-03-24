"use client";

import type {
  BrandKitAsset,
  BrandKitDetail,
  BrandKitAssetType,
} from "@loomic/shared";
import { Sparkles, Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";

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
          {/* Default toggle */}
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
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Default
          </span>

          {/* Delete */}
          <button
            type="button"
            onClick={onDeleteKit}
            className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
            aria-label="Delete brand kit"
          >
            <Trash2 className="h-4 w-4" />
          </button>
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
          />
        </div>
      </div>
    </div>
  );
}
