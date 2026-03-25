"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GoogleFontItem } from "../../lib/font-api";
import { fetchGoogleFonts } from "../../lib/font-api";

interface FontPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (font: { family: string; variant: string; category: string }) => void;
}

const CATEGORIES = [
  { value: "", label: "全部字体" },
  { value: "sans-serif", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "display", label: "Display" },
  { value: "handwriting", label: "Handwriting" },
  { value: "monospace", label: "Monospace" },
];

const PAGE_SIZE = 50;

export function FontPickerDialog({
  open,
  onClose,
  onSelect,
}: FontPickerDialogProps) {
  const [fonts, setFonts] = useState<GoogleFontItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<GoogleFontItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadedFamilies, setLoadedFamilies] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch fonts on open / search / category change
  useEffect(() => {
    if (!open) return;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const result = await fetchGoogleFonts(search || undefined, category || undefined);
      setFonts(result);
      setVisibleCount(PAGE_SIZE);
    }, search ? 300 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [open, search, category]);

  // Load font CSS for visible items
  const ensureFontLoaded = useCallback((family: string) => {
    setLoadedFamilies((prev) => {
      if (prev.has(family)) return prev;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
      document.head.appendChild(link);
      const next = new Set(prev);
      next.add(family);
      return next;
    });
  }, []);

  // Scroll handler for loading more
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setVisibleCount((c) => Math.min(c + PAGE_SIZE, fonts.length));
    }
  }, [fonts.length]);

  const handleAdd = useCallback(() => {
    if (!selected) return;
    onSelect({
      family: selected.family,
      variant: selected.variants.includes("regular") ? "regular" : selected.variants[0] ?? "400",
      category: selected.category,
    });
    onClose();
  }, [selected, onSelect, onClose]);

  if (!open) return null;

  const visibleFonts = fonts.slice(0, visibleCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-[420px] max-h-[520px] bg-white rounded-xl shadow-lg border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div className="p-3 border-b">
          <input
            type="text"
            placeholder="搜索字体..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-1 focus:ring-black/10"
          />
        </div>

        {/* Category filter */}
        <div className="px-3 py-2 border-b">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm bg-transparent outline-none cursor-pointer"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Font list */}
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto min-h-0"
        >
          {visibleFonts.map((font) => {
            ensureFontLoaded(font.family);
            return (
              <button
                key={font.family}
                type="button"
                onClick={() => setSelected(font)}
                className={`w-full px-4 py-2 text-left text-base hover:bg-neutral-50 cursor-pointer ${
                  selected?.family === font.family ? "bg-neutral-100" : ""
                }`}
                style={{ fontFamily: `"${font.family}", sans-serif` }}
              >
                {font.family}
              </button>
            );
          })}
          {fonts.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">
              {search ? "未找到匹配字体" : "加载中..."}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-3 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm border rounded-lg hover:bg-neutral-50 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selected}
            className="px-4 py-1.5 text-sm bg-black text-white rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
