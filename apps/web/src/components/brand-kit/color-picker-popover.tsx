"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

import { cn } from "../../lib/utils";

interface ColorPickerPopoverProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, hex: string) => void;
  initialName?: string;
  initialHex?: string;
  mode: "create" | "edit";
  anchorRef: React.RefObject<HTMLElement | null>;
}

const HEX_RE = /^[0-9A-Fa-f]{6}$/;

function normalizeHex(raw: string): string | null {
  const cleaned = raw.replace(/^#/, "");
  if (HEX_RE.test(cleaned)) return `#${cleaned.toUpperCase()}`;
  return null;
}

export function ColorPickerPopover({
  open,
  onClose,
  onSave,
  initialName = "",
  initialHex = "#6366F1",
  mode,
  anchorRef,
}: ColorPickerPopoverProps) {
  const [name, setName] = useState(initialName);
  const [hex, setHex] = useState(initialHex);
  const [hexInput, setHexInput] = useState(initialHex.replace("#", ""));
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync initial values when popover opens
  useEffect(() => {
    if (open) {
      setName(initialName);
      setHex(initialHex);
      setHexInput(initialHex.replace("#", ""));
    }
  }, [open, initialName, initialHex]);

  // Outside click detection
  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open, onClose, anchorRef]);

  const handlePickerChange = useCallback((newHex: string) => {
    const upper = newHex.toUpperCase();
    setHex(upper);
    setHexInput(upper.replace("#", ""));
  }, []);

  const handleHexInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setHexInput(raw);
      const normalized = normalizeHex(raw);
      if (normalized) setHex(normalized);
    },
    [],
  );

  const handleSave = useCallback(() => {
    const trimmedName = name.trim() || hex;
    onSave(trimmedName, hex);
    onClose();
  }, [name, hex, onSave, onClose]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute z-50 w-[260px] rounded-2xl border bg-popover p-3 shadow-lg",
        "flex flex-col gap-2.5",
      )}
    >
      {/* Name input */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Color name"
        className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-muted-foreground/60"
      />

      {/* Color picker */}
      <div className="[&_.react-colorful]:!w-full [&_.react-colorful]:!h-[160px] [&_.react-colorful]:rounded-lg">
        <HexColorPicker color={hex} onChange={handlePickerChange} />
      </div>

      {/* Preview + hex input */}
      <div className="flex items-center gap-2">
        <div
          className="h-8 w-8 shrink-0 rounded-lg border"
          style={{ backgroundColor: hex }}
        />
        <div className="flex items-center gap-0.5 rounded-lg border px-2 py-1 text-sm flex-1">
          <span className="text-muted-foreground">#</span>
          <input
            type="text"
            value={hexInput}
            onChange={handleHexInputChange}
            maxLength={6}
            className="w-full bg-transparent outline-none uppercase font-mono text-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {mode === "create" ? "Add" : "Save"}
        </button>
      </div>
    </div>
  );
}
