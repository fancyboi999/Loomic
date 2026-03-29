"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ── Types ── */
// biome-ignore lint/suspicious/noExplicitAny: Excalidraw element has no public type
type ExcalidrawEl = any;

export type CanvasLayersPanelProps = {
  // biome-ignore lint/suspicious/noExplicitAny: Excalidraw API has no public type definition
  excalidrawApi: any;
  open: boolean;
  onClose: () => void;
};

/* ── Icon helpers ── */
const LockIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" className={className}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const EyeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const CloseIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

/* ── Element helpers ── */
function elLabel(el: ExcalidrawEl): string {
  if (el.customData?.type === "image-generator") {
    return el.customData?.title?.slice(0, 20) || "Image Generator";
  }
  if (el.type === "text") return (el.text as string)?.slice(0, 20) || "Text";
  if (el.type === "image") {
    return el.customData?.title?.slice(0, 20) || "Image";
  }
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}

function elThumbnailIcon(el: ExcalidrawEl): string {
  if (el.customData?.type === "image-generator") return "\u2728";
  if (el.type === "text") return "T";
  if (el.type === "image") return "";
  if (el.type === "rectangle") return "\u25AD";
  if (el.type === "ellipse") return "\u25EF";
  if (el.type === "diamond") return "\u25C7";
  if (el.type === "line") return "\u2500";
  if (el.type === "arrow") return "\u2192";
  return "\u25C6";
}

/* ── Thumbnail component ── */
function LayerThumbnail({
  el,
  files,
}: {
  el: ExcalidrawEl;
  files: Record<string, any>;
}) {
  const icon = elThumbnailIcon(el);

  // For image elements, try to show a small preview
  if (el.type === "image" && el.fileId) {
    const file = files[el.fileId];
    if (file?.dataURL) {
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted overflow-hidden">
          <img
            src={file.dataURL}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      );
    }
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted text-[11px] leading-none text-muted-foreground">
      {icon}
    </div>
  );
}

/* ── Layer row ── */
function LayerRow({
  el,
  files,
  selected,
  onSelect,
}: {
  el: ExcalidrawEl;
  files: Record<string, any>;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`group/layer flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors ${
        selected
          ? "bg-muted"
          : "hover:bg-muted"
      }`}
      onClick={() => onSelect(el.id)}
    >
      <LayerThumbnail el={el} files={files} />
      <span className="flex-1 truncate text-[11px] text-foreground">
        {elLabel(el)}
      </span>
      <div className="flex items-center gap-0.5">
        <span
          className="invisible flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover/layer:visible cursor-pointer"
          role="button"
          tabIndex={-1}
        >
          <LockIcon className="h-4 w-4" />
        </span>
        <span
          className="invisible flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover/layer:visible cursor-pointer"
          role="button"
          tabIndex={-1}
        >
          <EyeIcon className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}

/* ================================================================
   Main component
   ================================================================ */
export function CanvasLayersPanel({
  excalidrawApi,
  open,
  onClose,
}: CanvasLayersPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<ExcalidrawEl[]>([]);
  const [files, setFiles] = useState<Record<string, any>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  /* ── Refresh elements on open + subscribe to changes ── */
  const refreshElements = useCallback(() => {
    if (!excalidrawApi) return;
    const all = excalidrawApi.getSceneElements() as ExcalidrawEl[];
    setElements(all.filter((el: ExcalidrawEl) => !el.isDeleted).reverse());
    setFiles(excalidrawApi.getFiles() ?? {});
    const state = excalidrawApi.getAppState();
    setSelectedIds(state.selectedElementIds ?? {});
  }, [excalidrawApi]);

  useEffect(() => {
    if (!open || !excalidrawApi) return;
    refreshElements();
    const unsubscribe = excalidrawApi.onChange(() => {
      refreshElements();
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [open, excalidrawApi, refreshElements]);

  /* ── Escape to close ── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  /* ── Select element on canvas ── */
  const selectElement = useCallback(
    (id: string) => {
      excalidrawApi?.updateScene({
        appState: { selectedElementIds: { [id]: true } },
      });
    },
    [excalidrawApi],
  );

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed left-0 top-0 z-30 flex h-full w-[280px] flex-col border-r border-border bg-card animate-in slide-in-from-left duration-200"
      onKeyDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Title bar */}
      <div className="flex h-11 shrink-0 items-center justify-between px-3">
        <span className="text-sm font-medium text-foreground">图层</span>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          onClick={onClose}
          aria-label="Close layers panel"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Separator */}
      <div className="h-px bg-border" />

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {elements.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            画布为空
          </p>
        ) : (
          elements.map((el: ExcalidrawEl) => (
            <LayerRow
              key={el.id}
              el={el}
              files={files}
              selected={!!selectedIds[el.id]}
              onSelect={selectElement}
            />
          ))
        )}
      </div>
    </div>
  );
}
