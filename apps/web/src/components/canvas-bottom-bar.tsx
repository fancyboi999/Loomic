"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ── Preset color swatches for background picker ── */
const BG_PRESETS = ["#FFFFFF","#F5F5F5","#FFF8F0","#F0F4FF","#1E1E1E","#000000","#d3f256","#E8F5E9"] as const;

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 30;
const ZOOM_STEP = 1.1;

/* ── Types ── */
interface CanvasBottomBarProps {
  // biome-ignore lint/suspicious/noExplicitAny: Excalidraw API has no public type definition
  excalidrawApi: any | null;
}

/* ── Inline SVG icons ── */
type IcoProps = { className?: string | undefined; children: React.ReactNode; vb?: string | undefined; fill?: string | undefined };
const Ico = ({ className, children, vb = "0 0 16 16", fill = "none" }: IcoProps) => (
  <svg viewBox={vb} fill={fill} className={className}>{children}</svg>
);
const MinusIcon = ({ className }: { className?: string }) => <Ico className={className}><path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Ico>;
const PlusIcon = ({ className }: { className?: string }) => <Ico className={className}><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Ico>;
const LayersIcon = ({ className }: { className?: string }) => <Ico className={className} vb="0 0 20 20" fill="currentColor"><path d="M17.189 12.48a.65.65 0 0 1 .622 1.141l-7.5 4.1a.65.65 0 0 1-.623 0l-7.5-4.1a.65.65 0 0 1 .624-1.14L10 16.41zm0-3.036a.65.65 0 0 1 .622 1.14l-7.5 4.1a.65.65 0 0 1-.623 0l-7.5-4.1a.65.65 0 0 1 .624-1.14L10 13.374zm-7.426-7.2a.65.65 0 0 1 .549.035l7.5 4.1a.651.651 0 0 1 0 1.14l-7.5 4.101a.65.65 0 0 1-.624 0l-7.5-4.1a.651.651 0 0 1 0-1.14l7.5-4.101zM3.854 6.948 10 10.31l6.145-3.36L10 3.59z" /></Ico>;
const SearchIcon = ({ className }: { className?: string }) => <Ico className={className}><circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" /><path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Ico>;

/* ── Hook: dismiss popover on Escape / click-outside ── */
function usePopoverDismiss(
  open: boolean, onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onClick, true);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onClick, true); };
  }, [open, onClose, containerRef, triggerRef]);
}

/* ── Portal popover positioned above its trigger ── */
function Popover({ open, triggerRef, onClose, children }: {
  open: boolean; triggerRef: React.RefObject<HTMLElement | null>; onClose: () => void; children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, onClose, containerRef, triggerRef);
  const [pos, setPos] = useState<React.CSSProperties>({ opacity: 0 });

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ position: "fixed", left: r.left, bottom: window.innerHeight - r.top + 8, opacity: 1, zIndex: 50 });
  }, [open, triggerRef]);

  if (!open) return null;
  return createPortal(
    <div ref={containerRef} style={pos}
      className="rounded-lg bg-card border border-border shadow-float p-2 animate-in fade-in slide-in-from-bottom-2 duration-150"
      onKeyDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
    >{children}</div>,
    document.body,
  );
}

/* ── Toolbar button ── */
const btnClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";

/* ── Element helpers for Layers / Search ── */
// biome-ignore lint/suspicious/noExplicitAny: Excalidraw element has no public type
type ExcalidrawEl = any;
const TYPE_ICONS: Record<string, string> = { text:"T", image:"🖼", rectangle:"▭", ellipse:"◯", diamond:"◇", line:"─", arrow:"→" };
const elTypeIcon = (t: string) => TYPE_ICONS[t] ?? "◆";
function elLabel(el: ExcalidrawEl): string {
  if (el.type === "text") return (el.text as string)?.slice(0, 20) || "Text";
  if (el.type === "image") return "Image";
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}

function ElementRow({ el, onSelect }: { el: ExcalidrawEl; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md hover:bg-muted transition-colors text-foreground text-left"
      onClick={() => onSelect(el.id)}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-muted text-[10px] leading-none">
        {elTypeIcon(el.type)}
      </span>
      <span className="truncate">{elLabel(el)}</span>
    </button>
  );
}

/* ================================================================
   Main component
   ================================================================ */
export function CanvasBottomBar({ excalidrawApi }: CanvasBottomBarProps) {
  /* ── Zoom state ── */
  const [zoom, setZoom] = useState(1);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomBtnRef = useRef<HTMLButtonElement>(null);

  /* ── Background color state ── */
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [hexInput, setHexInput] = useState("#FFFFFF");
  const bgBtnRef = useRef<HTMLButtonElement>(null);

  /* ── Layers state ── */
  const [layersOpen, setLayersOpen] = useState(false);
  const layersBtnRef = useRef<HTMLButtonElement>(null);

  /* ── Search state ── */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  /* ── Sync zoom from excalidraw ── */
  useEffect(() => {
    if (!excalidrawApi) return;
    // Read initial values
    const state = excalidrawApi.getAppState();
    setZoom(state.zoom.value);
    setBgColor(state.viewBackgroundColor ?? "#FFFFFF");
    setHexInput(state.viewBackgroundColor ?? "#FFFFFF");

    // Subscribe to changes
    const unsubscribe = excalidrawApi.onChange(() => {
      const s = excalidrawApi.getAppState();
      setZoom(s.zoom.value);
      const bg = s.viewBackgroundColor ?? "#FFFFFF";
      setBgColor(bg);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [excalidrawApi]);

  /* ── Zoom helpers ── */
  const applyZoom = useCallback((value: number) => {
    excalidrawApi?.updateScene({ appState: { zoom: { value } } });
  }, [excalidrawApi]);

  const handleZoomIn = useCallback(() => {
    if (!excalidrawApi) return;
    applyZoom(Math.min(excalidrawApi.getAppState().zoom.value * ZOOM_STEP, ZOOM_MAX));
  }, [excalidrawApi, applyZoom]);

  const handleZoomOut = useCallback(() => {
    if (!excalidrawApi) return;
    applyZoom(Math.max(excalidrawApi.getAppState().zoom.value / ZOOM_STEP, ZOOM_MIN));
  }, [excalidrawApi, applyZoom]);

  const handleZoomTo = useCallback((v: number) => { applyZoom(v); setZoomMenuOpen(false); }, [applyZoom]);
  const handleFitAll = useCallback(() => { excalidrawApi?.scrollToContent(); setZoomMenuOpen(false); }, [excalidrawApi]);

  /* ── Background color helpers ── */
  const handleBgColor = useCallback((hex: string) => {
    if (!excalidrawApi) return;
    excalidrawApi.updateScene({ appState: { viewBackgroundColor: hex } });
    setBgColor(hex);
    setHexInput(hex);
  }, [excalidrawApi]);

  const handleHexSubmit = useCallback(() => {
    const c = hexInput.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c)) { handleBgColor(c); setBgPickerOpen(false); }
  }, [hexInput, handleBgColor]);

  /* ── Element list (read fresh each open) ── */
  const [elements, setElements] = useState<ExcalidrawEl[]>([]);

  const refreshElements = useCallback(() => {
    if (!excalidrawApi) return;
    const all = excalidrawApi.getSceneElements() as ExcalidrawEl[];
    setElements(all.filter((el: ExcalidrawEl) => !el.isDeleted).reverse());
  }, [excalidrawApi]);

  const selectElement = useCallback((id: string) => {
    excalidrawApi?.updateScene({ appState: { selectedElementIds: { [id]: true } } });
  }, [excalidrawApi]);

  const filteredElements = useMemo(() => {
    if (!searchQuery.trim()) return elements;
    const q = searchQuery.trim().toLowerCase();
    return elements.filter((el: ExcalidrawEl) => {
      if (el.type === "text" && (el.text as string)?.toLowerCase().includes(q)) return true;
      return el.type.toLowerCase().includes(q);
    });
  }, [elements, searchQuery]);

  /* ── Toggle helpers (close sibling popovers) ── */
  const closeAll = useCallback(() => {
    setZoomMenuOpen(false); setBgPickerOpen(false); setLayersOpen(false); setSearchOpen(false);
  }, []);
  const toggleZoomMenu = useCallback(() => { const next = !zoomMenuOpen; closeAll(); if (next) setZoomMenuOpen(true); }, [zoomMenuOpen, closeAll]);
  const toggleBgPicker = useCallback(() => { const next = !bgPickerOpen; closeAll(); if (next) setBgPickerOpen(true); }, [bgPickerOpen, closeAll]);
  const toggleLayers = useCallback(() => {
    const next = !layersOpen; closeAll(); if (next) { refreshElements(); setLayersOpen(true); }
  }, [layersOpen, closeAll, refreshElements]);
  const toggleSearch = useCallback(() => {
    const next = !searchOpen; closeAll(); if (next) { refreshElements(); setSearchQuery(""); setSearchOpen(true); }
  }, [searchOpen, closeAll, refreshElements]);

  /* Focus search input when opened */
  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [searchOpen]);

  return (
    <div
      className="absolute bottom-4 left-4 z-20"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 rounded-full bg-card/90 backdrop-blur-lg border border-border px-1 py-1 shadow-card">
        {/* ── Background color button ── */}
        <button ref={bgBtnRef} type="button" className={btnClass} onClick={toggleBgPicker} aria-label="Background color">
          <span className="block h-4 w-4 rounded-full border border-border" style={{ backgroundColor: bgColor }} />
        </button>

        {/* ── Layers button ── */}
        <button ref={layersBtnRef} type="button" className={btnClass} onClick={toggleLayers} aria-label="Layers">
          <LayersIcon className="h-4 w-4" />
        </button>

        {/* ── Search button ── */}
        <button ref={searchBtnRef} type="button" className={btnClass} onClick={toggleSearch} aria-label="Search">
          <SearchIcon className="h-3.5 w-3.5" />
        </button>

        {/* ── Divider ── */}
        <span className="mx-1 h-3 w-px bg-border" />

        {/* ── Zoom controls ── */}
        <button type="button" className={btnClass} onClick={handleZoomOut} aria-label="Zoom out"><MinusIcon className="h-3.5 w-3.5" /></button>
        <button ref={zoomBtnRef} type="button" className="min-w-[40px] text-center text-xs text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors" onClick={toggleZoomMenu}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className={btnClass} onClick={handleZoomIn} aria-label="Zoom in"><PlusIcon className="h-3.5 w-3.5" /></button>
      </div>

      {/* ── Zoom preset popover ── */}
      <Popover open={zoomMenuOpen} triggerRef={zoomBtnRef} onClose={() => setZoomMenuOpen(false)}>
        <div className="flex flex-col gap-0.5 min-w-[100px]">
          {ZOOM_PRESETS.map((v) => (
            <button key={v} type="button" className="px-3 py-1.5 text-xs text-left rounded-md hover:bg-muted transition-colors text-foreground" onClick={() => handleZoomTo(v)}>{Math.round(v * 100)}%</button>
          ))}
          <div className="h-px bg-border my-0.5" />
          <button type="button" className="px-3 py-1.5 text-xs text-left rounded-md hover:bg-muted transition-colors text-foreground" onClick={handleFitAll}>Fit All</button>
        </div>
      </Popover>

      {/* ── Background color picker popover ── */}
      <Popover open={bgPickerOpen} triggerRef={bgBtnRef} onClose={() => setBgPickerOpen(false)}>
        <div className="flex flex-col gap-2 min-w-[160px]">
          <div className="grid grid-cols-4 gap-1.5">
            {BG_PRESETS.map((hex) => (
              <button key={hex} type="button" className="h-7 w-7 rounded-md border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: hex }} onClick={() => { handleBgColor(hex); setBgPickerOpen(false); }} aria-label={`Set background to ${hex}`} />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input type="text" value={hexInput} onChange={(e) => setHexInput(e.target.value)} placeholder="#RRGGBB" maxLength={7}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleHexSubmit(); }}
              className="flex-1 h-7 rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring" />
            <button type="button" className="h-7 w-7 rounded-md border border-border" aria-label="Color preview"
              style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(hexInput.trim()) ? hexInput.trim() : bgColor }} />
          </div>
        </div>
      </Popover>

      {/* ── Layers panel popover ── */}
      <Popover open={layersOpen} triggerRef={layersBtnRef} onClose={() => setLayersOpen(false)}>
        <div className="flex flex-col min-w-[200px]">
          <span className="px-2 py-1.5 text-xs font-medium text-muted-foreground">图层</span>
          <div className="max-h-[300px] overflow-y-auto">
            {elements.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground text-center">画布为空</p>
            ) : (
              elements.map((el: ExcalidrawEl) => (
                <ElementRow key={el.id} el={el} onSelect={(id) => { selectElement(id); setLayersOpen(false); }} />
              ))
            )}
          </div>
        </div>
      </Popover>

      {/* ── Element search popover ── */}
      <Popover open={searchOpen} triggerRef={searchBtnRef} onClose={() => setSearchOpen(false)}>
        <div className="flex flex-col min-w-[200px]">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="搜索画布元素..."
            className="h-7 rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring mb-1"
          />
          <div className="max-h-[300px] overflow-y-auto">
            {filteredElements.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground text-center">
                {searchQuery.trim() ? "未找到匹配元素" : "画布为空"}
              </p>
            ) : (
              filteredElements.map((el: ExcalidrawEl) => (
                <ElementRow key={el.id} el={el} onSelect={(id) => { selectElement(id); setSearchOpen(false); }} />
              ))
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}
