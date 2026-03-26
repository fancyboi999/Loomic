"use client";

import { useEffect, useRef } from "react";

export type CanvasImageItem = {
  id: string;
  name: string;
  thumbnailUrl: string;
  assetId: string;
  url: string;
  mimeType: string;
};

type CanvasImagePickerProps = {
  items: CanvasImageItem[];
  onSelect: (item: CanvasImageItem) => void;
  onClose: () => void;
};

export function CanvasImagePicker({ items, onSelect, onClose }: CanvasImagePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (items.length === 0) {
    return (
      <div
        ref={containerRef}
        className="absolute bottom-full left-2 mb-2 w-56 rounded-xl border border-[#E3E3E3] bg-white p-3 shadow-lg"
      >
        <p className="text-xs text-[#A4A9B2]">No images on canvas</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-2 mb-2 max-h-64 w-64 overflow-y-auto rounded-xl border border-[#E3E3E3] bg-white shadow-lg"
    >
      <div className="p-2">
        <div className="mb-1.5 px-1 text-[11px] font-medium text-[#A4A9B2]">
          Canvas Images
        </div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onSelect(item);
              onClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[#F5F5F7]"
          >
            <img
              src={item.thumbnailUrl}
              alt={item.name}
              className="h-8 w-8 shrink-0 rounded border border-[#E3E3E3] object-cover"
            />
            <span className="truncate text-sm text-[#2F3640]">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
