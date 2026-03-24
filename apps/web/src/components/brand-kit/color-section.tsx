"use client";

import type { BrandKitAsset } from "@loomic/shared";
import { Plus, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { ColorPickerPopover } from "./color-picker-popover";
import { InlineInput } from "./inline-input";
import { SectionHeader } from "./section-header";

interface ColorSectionProps {
  colors: BrandKitAsset[];
  onAddColor: (name: string, hex: string) => void;
  onUpdateColor: (assetId: string, name: string, hex: string) => void;
  onDeleteColor: (assetId: string) => void;
  onUpdateLabel: (assetId: string, name: string) => void;
}

export function ColorSection({
  colors,
  onAddColor,
  onUpdateColor,
  onDeleteColor,
  onUpdateLabel,
}: ColorSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<BrandKitAsset | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const editAnchorRef = useRef<HTMLDivElement>(null);

  const handleAddClick = useCallback(() => {
    setEditingAsset(null);
    setPickerOpen(true);
  }, []);

  const handleSwatchClick = useCallback((asset: BrandKitAsset) => {
    setEditingAsset(asset);
    setPickerOpen(true);
  }, []);

  const handlePickerSave = useCallback(
    (name: string, hex: string) => {
      if (editingAsset) {
        onUpdateColor(editingAsset.id, name, hex);
      } else {
        onAddColor(name, hex);
      }
    },
    [editingAsset, onAddColor, onUpdateColor],
  );

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
    setEditingAsset(null);
  }, []);

  return (
    <section>
      <SectionHeader title="Colors" count={colors.length} />
      <div className="flex flex-wrap gap-3">
        {colors.map((color) => (
          <div key={color.id} className="flex flex-col items-center gap-1.5">
            <div className="relative group" ref={editingAsset?.id === color.id ? editAnchorRef : undefined}>
              <button
                type="button"
                onClick={() => handleSwatchClick(color)}
                className="w-[69px] h-[69px] rounded-xl border cursor-pointer transition-shadow hover:shadow-md"
                style={{ backgroundColor: color.text_content ?? "#888888" }}
                aria-label={`Edit color ${color.display_name}`}
              />
              <button
                type="button"
                onClick={() => onDeleteColor(color.id)}
                className={cn(
                  "absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border shadow-sm",
                  "flex items-center justify-center",
                  "opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer",
                )}
                aria-label={`Delete color ${color.display_name}`}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
              {/* Popover anchored to the swatch being edited */}
              {editingAsset?.id === color.id && (
                <ColorPickerPopover
                  open={pickerOpen}
                  onClose={handlePickerClose}
                  onSave={handlePickerSave}
                  initialName={color.display_name}
                  initialHex={color.text_content ?? "#888888"}
                  mode="edit"
                  anchorRef={editAnchorRef}
                />
              )}
            </div>
            <InlineInput
              value={color.display_name}
              onCommit={(name) => onUpdateLabel(color.id, name)}
              className="w-[69px]"
              inputClassName="text-xs text-center text-muted-foreground truncate"
            />
          </div>
        ))}

        {/* Add button */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative">
            <button
              ref={addButtonRef}
              type="button"
              onClick={handleAddClick}
              className="w-[69px] h-[69px] rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
              aria-label="Add color"
            >
              <Plus className="h-5 w-5 text-muted-foreground/60" />
            </button>
            {/* Popover anchored to add button */}
            {!editingAsset && (
              <ColorPickerPopover
                open={pickerOpen}
                onClose={handlePickerClose}
                onSave={handlePickerSave}
                mode="create"
                anchorRef={addButtonRef}
              />
            )}
          </div>
          <span className="text-xs text-muted-foreground/60">Add</span>
        </div>
      </div>
    </section>
  );
}
