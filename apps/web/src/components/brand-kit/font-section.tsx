"use client";

import type { BrandKitAsset } from "@loomic/shared";
import { Plus, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { InlineInput } from "./inline-input";
import { SectionHeader } from "./section-header";

interface FontSectionProps {
  fonts: BrandKitAsset[];
  onAddFont: (name: string) => void;
  onDeleteFont: (assetId: string) => void;
  onUpdateLabel: (assetId: string, name: string) => void;
}

export function FontSection({
  fonts,
  onAddFont,
  onDeleteFont,
  onUpdateLabel,
}: FontSectionProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startAdding = useCallback(() => {
    setAdding(true);
    setNewName("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const commitAdd = useCallback(() => {
    const trimmed = newName.trim();
    if (trimmed) {
      onAddFont(trimmed);
    }
    setAdding(false);
    setNewName("");
  }, [newName, onAddFont]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") commitAdd();
      if (e.key === "Escape") {
        setAdding(false);
        setNewName("");
      }
    },
    [commitAdd],
  );

  return (
    <section>
      <SectionHeader title="Fonts" count={fonts.length} />
      <div className="flex flex-wrap gap-3">
        {fonts.map((font) => (
          <div key={font.id} className="flex flex-col items-center gap-1.5">
            <div className="relative group">
              <div className="w-[150px] h-[113px] rounded-xl border bg-muted/30 flex items-center justify-center">
                <span className="text-3xl font-light text-foreground/70 select-none">
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

        {/* Add button / adding input */}
        <div className="flex flex-col items-center gap-1.5">
          {adding ? (
            <>
              <div className="w-[150px] h-[113px] rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                <span className="text-3xl font-light text-muted-foreground/40 select-none">
                  Ag
                </span>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={commitAdd}
                onKeyDown={handleKeyDown}
                placeholder="Font name"
                className="w-[150px] text-xs text-center bg-transparent border-b border-dashed border-muted-foreground/40 outline-none"
              />
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startAdding}
                className="w-[150px] h-[113px] rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
                aria-label="Add font"
              >
                <Plus className="h-5 w-5 text-muted-foreground/60" />
              </button>
              <span className="text-xs text-muted-foreground/60">Add</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
