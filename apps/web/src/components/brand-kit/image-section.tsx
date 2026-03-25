"use client";

import type { BrandKitAsset } from "@loomic/shared";
import { useCallback, useRef } from "react";

import { AddAssetCard, AssetCard } from "./asset-card";
import { SectionHeader } from "./section-header";

interface ImageSectionProps {
  images: BrandKitAsset[];
  onDelete: (assetId: string) => void;
  onUpdateLabel: (assetId: string, name: string) => void;
  onUpload: (file: File) => void;
}

export function ImageSection({
  images,
  onDelete,
  onUpdateLabel,
  onUpload,
}: ImageSectionProps) {
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
      e.target.value = "";
    },
    [onUpload],
  );

  return (
    <section>
      <SectionHeader title="Images" count={images.length} />
      <div className="flex flex-wrap gap-3">
        {images.map((image) => (
          <AssetCard
            key={image.id}
            asset={image}
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
