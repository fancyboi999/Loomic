"use client";

import type { BrandKitAsset } from "@loomic/shared";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { FontPickerDialog } from "./font-picker-dialog";
import { InlineInput } from "./inline-input";
import { SectionHeader } from "./section-header";

interface FontSectionProps {
  fonts: BrandKitAsset[];
  onAddFont: (data: {
    family: string;
    variant: string;
    category: string;
  }) => void;
  onDeleteFont: (assetId: string) => void;
  onUpdateLabel: (assetId: string, name: string) => void;
}

export function FontSection({
  fonts,
  onAddFont,
  onDeleteFont,
  onUpdateLabel,
}: FontSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [menuOpen]);

  // Load Google Fonts CSS for each font card
  useEffect(() => {
    const families = fonts
      .map((f) => f.text_content)
      .filter((v): v is string => Boolean(v));

    const uniqueFamilies = [...new Set(families)];

    for (const family of uniqueFamilies) {
      const linkId = `gfont-${family.replace(/\s+/g, "-")}`;
      if (document.getElementById(linkId)) continue;
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
      document.head.appendChild(link);
    }
  }, [fonts]);

  const handleManualInput = useCallback(() => {
    setMenuOpen(false);
    const name = window.prompt("输入字体名称");
    if (!name?.trim()) return;
    onAddFont({ family: name.trim(), variant: "regular", category: "sans-serif" });
  }, [onAddFont]);

  const handlePickerSelect = useCallback(
    (font: { family: string; variant: string; category: string }) => {
      onAddFont(font);
    },
    [onAddFont],
  );

  return (
    <section>
      <SectionHeader title="Fonts" count={fonts.length} />
      <div className="flex flex-wrap gap-3">
        {fonts.map((font) => (
          <div key={font.id} className="flex flex-col items-center gap-1.5">
            <div className="relative group">
              <div className="w-[150px] h-[113px] rounded-xl border bg-muted/30 flex items-center justify-center">
                <span
                  className="text-3xl font-light text-foreground/70 select-none"
                  style={{
                    fontFamily: font.text_content
                      ? `"${font.text_content}", sans-serif`
                      : undefined,
                  }}
                >
                  Ag
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDeleteFont(font.id)}
                className={cn(
                  "absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border shadow-sm",
                  "flex items-center justify-center",
                  "opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer",
                )}
                aria-label={`Delete font ${font.display_name}`}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
            <InlineInput
              value={font.display_name}
              onCommit={(name) => onUpdateLabel(font.id, name)}
              className="w-[150px]"
              inputClassName="text-xs text-center text-muted-foreground truncate"
            />
          </div>
        ))}

        {/* Add button with dropdown menu */}
        <div className="flex flex-col items-center gap-1.5">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="w-[150px] h-[113px] rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
              aria-label="Add font"
            >
              <Plus className="h-5 w-5 text-muted-foreground/60" />
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 w-[180px] rounded-xl border bg-popover p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setPickerOpen(true);
                  }}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  从字体库选择
                </button>
                <button
                  type="button"
                  onClick={handleManualInput}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  手动输入字体名称
                </button>
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground/60">Add</span>
        </div>
      </div>

      <FontPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
      />
    </section>
  );
}
