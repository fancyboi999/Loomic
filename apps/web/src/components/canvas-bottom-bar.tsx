"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";

/* ── Preset color swatches for background picker ── */
const BG_PRESETS = ["transparent","#000000","#FFFFFF","#d3f256","#6C5CE7","#00B894","#FD79A8","#0984E3"] as const;

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 30;
const ZOOM_STEP = 1.1;

/* ── Types ── */
interface CanvasBottomBarProps {
  // biome-ignore lint/suspicious/noExplicitAny: Excalidraw API has no public type definition
  excalidrawApi: any | null;
  layersOpen: boolean;
  onToggleLayers: () => void;
}

/* ── Inline SVG icons ── */
type IcoProps = { className?: string | undefined; children: React.ReactNode; vb?: string | undefined; fill?: string | undefined };
const Ico = ({ className, children, vb = "0 0 16 16", fill = "none" }: IcoProps) => (
  <svg viewBox={vb} fill={fill} className={className}>{children}</svg>
);
const MinusIcon = ({ className }: { className?: string }) => <Ico className={className}><path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Ico>;
const PlusIcon = ({ className }: { className?: string }) => <Ico className={className}><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Ico>;
const LayersIcon = ({ className }: { className?: string }) => <Ico className={className} vb="0 0 20 20" fill="currentColor"><path d="M17.189 12.48a.65.65 0 0 1 .622 1.141l-7.5 4.1a.65.65 0 0 1-.623 0l-7.5-4.1a.65.65 0 0 1 .624-1.14L10 16.41zm0-3.036a.65.65 0 0 1 .622 1.14l-7.5 4.1a.65.65 0 0 1-.623 0l-7.5-4.1a.65.65 0 0 1 .624-1.14L10 13.374zm-7.426-7.2a.65.65 0 0 1 .549.035l7.5 4.1a.651.651 0 0 1 0 1.14l-7.5 4.101a.65.65 0 0 1-.624 0l-7.5-4.1a.651.651 0 0 1 0-1.14l7.5-4.101zM3.854 6.948 10 10.31l6.145-3.36L10 3.59z" /></Ico>;
const FileIcon = ({ className }: { className?: string }) => <Ico className={className} vb="0 0 24 24"><path d="M9 17h6M9 13h6M13 3H8.2c-1.12 0-1.68 0-2.108.218a2 2 0 0 0-.874.874C5 4.52 5 5.08 5 6.2v11.6c0 1.12 0 1.68.218 2.108a2 2 0 0 0 .874.874C6.52 21 7.08 21 8.2 21h7.6c1.12 0 1.68 0 2.108-.218a2 2 0 0 0 .874-.874C19 19.48 19 18.92 19 17.8V9m-6-6 6 6m-6-6v4.4c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C13.76 9 14.04 9 14.6 9H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></Ico>;
const CloseIcon = ({ className }: { className?: string }) => <Ico className={className}><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></Ico>;

/* checkerboard pattern for "transparent" swatch */
const CheckerIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" className={className}>
    <rect width="8" height="8" fill="#ccc" /><rect x="8" y="8" width="8" height="8" fill="#ccc" />
    <rect x="8" width="8" height="8" fill="#fff" /><rect y="8" width="8" height="8" fill="#fff" />
  </svg>
);

/* checkerboard inline style for the transparent swatch button */
const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage: "linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0,0 4px,4px -4px,-4px 0px",
};

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
function Popover({ open, triggerRef, onClose, children, className: extraClass }: {
  open: boolean; triggerRef: React.RefObject<HTMLElement | null>; onClose: () => void; children: React.ReactNode; className?: string;
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
      className={`rounded-lg bg-card border border-border shadow-float animate-in fade-in slide-in-from-bottom-2 duration-150 ${extraClass ?? "p-2"}`}
      onKeyDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
    >{children}</div>,
    document.body,
  );
}

/* ── Toolbar button ── */
const btnClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";

/* ── Element helpers for Search ── */
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
    <button type="button"
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
export function CanvasBottomBar({ excalidrawApi, layersOpen, onToggleLayers }: CanvasBottomBarProps) {
  /* ── Zoom state ── */
  const [zoom, setZoom] = useState(1);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomBtnRef = useRef<HTMLButtonElement>(null);

  /* ── Background color state ── */
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [hexInput, setHexInput] = useState("FFFFFF");
  const bgBtnRef = useRef<HTMLButtonElement>(null);

  /* ── Files list state ── */
  const [filesOpen, setFilesOpen] = useState(false);
  const filesBtnRef = useRef<HTMLButtonElement>(null);

  /* ── Sync zoom from excalidraw ── */
  useEffect(() => {
    if (!excalidrawApi) return;
    const state = excalidrawApi.getAppState();
    setZoom(state.zoom.value);
    const initBg = state.viewBackgroundColor ?? "#FFFFFF";
    setBgColor(initBg);
    setHexInput(initBg.replace(/^#/, "").toUpperCase());

    const unsubscribe = excalidrawApi.onChange(() => {
      const s = excalidrawApi.getAppState();
      setZoom(s.zoom.value);
      setBgColor(s.viewBackgroundColor ?? "#FFFFFF");
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
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
  const applyBgColor = useCallback((hex: string) => {
    if (!excalidrawApi) return;
    excalidrawApi.updateScene({ appState: { viewBackgroundColor: hex } });
    setBgColor(hex);
    if (hex !== "transparent") setHexInput(hex.replace(/^#/, "").toUpperCase());
  }, [excalidrawApi]);

  const handleHexInputSubmit = useCallback(() => {
    const raw = hexInput.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(raw)) applyBgColor(`#${raw}`);
  }, [hexInput, applyBgColor]);

  /* ── Generated image files list ── */
  type ImageFile = { id: string; name: string; dataURL: string };
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);

  const refreshImageFiles = useCallback(() => {
    if (!excalidrawApi) return;
    const allElements = excalidrawApi.getSceneElements() as ExcalidrawEl[];
    const files: Record<string, any> = excalidrawApi.getFiles() ?? {};
    const images: ImageFile[] = [];
    let idx = 0;
    for (const el of allElements) {
      if (el.isDeleted || el.type !== "image" || !el.fileId) continue;
      idx++;
      const file = files[el.fileId];
      const title = el.customData?.title || el.customData?.label || `Image ${idx}`;
      images.push({ id: el.id, name: title, dataURL: file?.dataURL ?? "" });
    }
    setImageFiles(images.reverse());
  }, [excalidrawApi]);

  const handleDownloadFile = useCallback((file: ImageFile) => {
    if (!file.dataURL) return;
    const a = document.createElement("a");
    a.href = file.dataURL;
    a.download = `${file.name}.png`;
    a.click();
  }, []);

  /* ── Toggle helpers (close sibling popovers) ── */
  const closeAllPopovers = useCallback(() => {
    setZoomMenuOpen(false); setBgPickerOpen(false); setFilesOpen(false);
  }, []);
  const toggleZoomMenu = useCallback(() => { const next = !zoomMenuOpen; closeAllPopovers(); if (next) setZoomMenuOpen(true); }, [zoomMenuOpen, closeAllPopovers]);
  const toggleBgPicker = useCallback(() => { const next = !bgPickerOpen; closeAllPopovers(); if (next) setBgPickerOpen(true); }, [bgPickerOpen, closeAllPopovers]);
  const toggleFiles = useCallback(() => {
    const next = !filesOpen; closeAllPopovers(); if (next) { refreshImageFiles(); setFilesOpen(true); }
  }, [filesOpen, closeAllPopovers, refreshImageFiles]);
  const handleToggleLayers = useCallback(() => { closeAllPopovers(); onToggleLayers(); }, [closeAllPopovers, onToggleLayers]);

  return (
    <div className="absolute bottom-4 left-4 z-20" onKeyDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-0.5 rounded-full bg-card/90 backdrop-blur-lg border border-border px-1 py-1 shadow-card">
        {/* ── Background color button ── */}
        <button ref={bgBtnRef} type="button" className={btnClass} onClick={toggleBgPicker} aria-label="Background color">
          {bgColor === "transparent"
            ? <CheckerIcon className="h-4 w-4 rounded-full" />
            : <span className="block h-4 w-4 rounded-full border border-border" style={{ backgroundColor: bgColor }} />}
        </button>

        {/* ── Layers button ── */}
        <button type="button" className={`${btnClass} ${layersOpen ? "bg-muted text-foreground" : ""}`} onClick={handleToggleLayers} aria-label="Layers">
          <LayersIcon className="h-4 w-4" />
        </button>

        {/* ── Files button ── */}
        <button ref={filesBtnRef} type="button" className={btnClass} onClick={toggleFiles} aria-label="Generated files">
          <FileIcon className="h-3.5 w-3.5" />
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
      <Popover open={bgPickerOpen} triggerRef={bgBtnRef} onClose={() => setBgPickerOpen(false)} className="w-[260px] rounded-2xl p-3">
        <div className="flex flex-col gap-3">
          {/* Title bar */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">画布背景色</span>
            <button type="button" className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setBgPickerOpen(false)} aria-label="Close color picker">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Separator */}
          <div className="h-px bg-border -mx-3" />
          {/* Color wheel picker */}
          <HexColorPicker
            color={bgColor === "transparent" ? "#FFFFFF" : bgColor}
            onChange={applyBgColor}
            style={{ width: "100%", height: 160 }}
          />
          {/* Preset swatches */}
          <div className="flex items-center gap-1.5">
            {BG_PRESETS.map((hex) => (
              <button key={hex} type="button"
                className={`h-7 w-7 shrink-0 rounded-full border hover:scale-110 transition-transform ${bgColor === hex ? "border-foreground ring-1 ring-foreground ring-offset-1 ring-offset-card" : "border-border"}`}
                style={hex === "transparent" ? CHECKER_STYLE : { backgroundColor: hex }}
                onClick={() => applyBgColor(hex)} aria-label={`Set background to ${hex}`} />
            ))}
          </div>
          {/* Hex input row */}
          <div className="flex items-center gap-1.5">
            <div className="flex flex-1 items-center rounded-lg border border-border bg-muted overflow-hidden">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center text-xs text-muted-foreground">#</span>
              <input type="text" value={hexInput}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6); setHexInput(v.toUpperCase()); }}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleHexInputSubmit(); }}
                onBlur={handleHexInputSubmit} maxLength={6}
                className="h-7 flex-1 border-none bg-transparent text-xs text-foreground outline-none" />
            </div>
            <div className="flex items-center rounded-lg border border-border bg-muted overflow-hidden">
              <input type="text" value="100" readOnly className="h-7 w-8 border-none bg-transparent text-center text-xs text-foreground outline-none" />
              <span className="flex h-7 w-6 shrink-0 items-center justify-center text-xs text-muted-foreground pr-1">%</span>
            </div>
          </div>
        </div>
      </Popover>

      {/* ── Generated files list popover ── */}
      <Popover open={filesOpen} triggerRef={filesBtnRef} onClose={() => setFilesOpen(false)}>
        <div className="flex flex-col min-w-[240px] max-w-[280px]">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-sm font-medium text-foreground">已生成文件</span>
            <button type="button" onClick={() => setFilesOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {imageFiles.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted-foreground text-center">暂无生成文件</p>
            ) : (
              <div className="flex flex-col gap-1">
                {imageFiles.map((file) => (
                  <div key={file.id} className="group flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-muted transition-colors">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg shadow-subtle">
                      {file.dataURL ? (
                        <img alt="" className="h-full w-full object-cover" draggable={false} src={file.dataURL} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground text-xs">N/A</div>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden text-sm leading-[22px] text-foreground">
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDownloadFile(file); }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      title="下载"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" fillOpacity={0.9}>
                        <path d="M3 17.25v-2.5a.75.75 0 0 1 1.5 0v2.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-2.5a.75.75 0 0 1 1.5 0v2.5A3.75 3.75 0 0 1 17.25 21H6.75A3.75 3.75 0 0 1 3 17.25m8.25-13.5a.75.75 0 0 1 1.5 0v9.44l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22z" />
                      </svg>
                    </button>
                  </div>
                ))}
                <p className="py-2 text-center text-xs text-muted-foreground">到底了</p>
              </div>
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}
