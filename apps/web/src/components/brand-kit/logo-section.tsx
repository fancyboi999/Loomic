"use client";

import type { BrandKitAsset } from "@loomic/shared";
import { useCallback, useRef } from "react";

import { AddAssetCard, AssetCard } from "./asset-card";
import { SectionHeader } from "./section-header";

interface LogoSectionProps {
  logos: BrandKitAsset[];
  onDelete: (assetId: string) => void;
  onUpdateLabel: (assetId: string, name: string) => void;
  onUpload: (file: File) => void;
}

export function LogoSection({
  logos,
  onDelete,
  onUpdateLabel,
  onUpload,
}: LogoSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onUpload(file);
      }
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [onUpload],
  );

  return (
    <section>
      <SectionHeader title="Logos" count={logos.length} />
      <div className="flex flex-wrap gap-3">
        {logos.map((logo) => (
          <AssetCard
            key={logo.id}
            asset={logo}
            onDelete={onDelete}
            onUpdateLabel={onUpdateLabel}
          />
        ))}
        <AddAssetCard label="Upload" onClick={handleClick} />
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </section>
  );
}
