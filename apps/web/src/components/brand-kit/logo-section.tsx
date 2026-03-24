import type { BrandKitAsset } from "@loomic/shared";

import { AddAssetCard, AssetCard } from "./asset-card";
import { SectionHeader } from "./section-header";

interface LogoSectionProps {
  logos: BrandKitAsset[];
  onDelete: (assetId: string) => void;
  onUpdateLabel: (assetId: string, name: string) => void;
}

export function LogoSection({
  logos,
  onDelete,
  onUpdateLabel,
}: LogoSectionProps) {
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
        <AddAssetCard label="Upload" disabled />
      </div>
    </section>
  );
}
