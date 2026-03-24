import type { BrandKitAsset } from "@loomic/shared";

import { AddAssetCard, AssetCard } from "./asset-card";
import { SectionHeader } from "./section-header";

interface ImageSectionProps {
  images: BrandKitAsset[];
  onDelete: (assetId: string) => void;
  onUpdateLabel: (assetId: string, name: string) => void;
}

export function ImageSection({
  images,
  onDelete,
  onUpdateLabel,
}: ImageSectionProps) {
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
        <AddAssetCard label="Upload" disabled />
      </div>
    </section>
  );
}
