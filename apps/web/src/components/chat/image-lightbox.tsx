"use client";

import { motion } from "framer-motion";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ------------------------------------------------------------------ */
/*  LightboxBtn — toolbar icon button                                  */
/* ------------------------------------------------------------------ */

function LightboxBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
    >
      <svg
        className="h-[18px] w-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  ImageLightbox — fullscreen image viewer with zoom/rotate/pan       */
/* ------------------------------------------------------------------ */

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [flipX, setFlipX] = useState(1);
  const [flipY, setFlipY] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const handleZoomIn = useCallback(
    () => setScale((s) => Math.min(s * 1.25, 8)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setScale((s) => Math.max(s / 1.25, 0.25)),
    [],
  );
  const handleRotateCW = useCallback(() => setRotate((r) => r + 90), []);
  const handleRotateCCW = useCallback(() => setRotate((r) => r - 90), []);
  const handleFlipX = useCallback(() => setFlipX((f) => f * -1), []);
  const handleFlipY = useCallback(() => setFlipY((f) => f * -1), []);
  const handleReset = useCallback(() => {
    setScale(1);
    setRotate(0);
    setFlipX(1);
    setFlipY(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = alt || "image";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab if download fails (e.g. CORS)
      window.open(src, "_blank");
    }
  }, [src, alt]);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") handleZoomIn();
      if (e.key === "-") handleZoomOut();
      if (e.key === "r") handleRotateCW();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, handleZoomIn, handleZoomOut, handleRotateCW]);

  // Wheel zoom - bound to overlay element to avoid interception
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) setScale((s) => Math.min(s * 1.1, 8));
      else setScale((s) => Math.max(s / 1.1, 0.25));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (scale <= 1) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        origX: translate.x,
        origY: translate.y,
      };
    },
    [scale, translate],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    setTranslate({
      x: d.origX + e.clientX - d.startX,
      y: d.origY + e.clientY - d.startY,
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  return createPortal(
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Image */}
      <div
        className="flex flex-1 w-full items-center justify-center overflow-hidden"
        onClick={onClose}
      >
        <img
          draggable
          src={src}
          alt={alt}
          className="max-h-[85vh] max-w-[90vw] object-contain select-none"
          style={{
            transform: `translate3d(${translate.x}px, ${translate.y}px, 0) scale3d(${scale * flipX}, ${scale * flipY}, 1) rotate(${rotate}deg)`,
            transition: dragRef.current.dragging
              ? "none"
              : "transform 0.2s ease",
            cursor: scale > 1 ? "grab" : "default",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      {/* Close button */}
      <button
        type="button"
        title="\u5173\u95ed (Esc)"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Toolbar */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1.5 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <LightboxBtn title="\u7f29\u5c0f (-)" onClick={handleZoomOut}>
          <path d="M5 12h14" />
        </LightboxBtn>
        <span className="min-w-[42px] text-center text-xs text-white/80 select-none">
          {Math.round(scale * 100)}%
        </span>
        <LightboxBtn title="\u653e\u5927 (+)" onClick={handleZoomIn}>
          <path d="M12 5v14M5 12h14" />
        </LightboxBtn>
        <div className="mx-1 h-4 w-px bg-white/20" />
        <LightboxBtn title="\u5de6\u53f3\u7ffb\u8f6c" onClick={handleFlipX}>
          <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
          <path d="M12 20V4" />
        </LightboxBtn>
        <LightboxBtn title="\u4e0a\u4e0b\u7ffb\u8f6c" onClick={handleFlipY}>
          <path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
          <path d="M4 12h16" />
        </LightboxBtn>
        <div className="mx-1 h-4 w-px bg-white/20" />
        <LightboxBtn title="\u9006\u65f6\u9488\u65cb\u8f6c" onClick={handleRotateCCW}>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
          <path d="M3 3v5h5" />
        </LightboxBtn>
        <LightboxBtn title="\u987a\u65f6\u9488\u65cb\u8f6c (R)" onClick={handleRotateCW}>
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </LightboxBtn>
        <div className="mx-1 h-4 w-px bg-white/20" />
        <LightboxBtn title="\u91cd\u7f6e" onClick={handleReset}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </LightboxBtn>
        <LightboxBtn title="\u4e0b\u8f7d" onClick={handleDownload}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </LightboxBtn>
      </div>
    </motion.div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  ChatImage — clickable thumbnail that opens lightbox                 */
/* ------------------------------------------------------------------ */

export const ChatImage = React.memo(function ChatImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-muted text-muted-foreground text-xs`}
        title="Image failed to load"
      >
        <svg
          className="h-5 w-5 opacity-40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z" />
        </svg>
      </div>
    );
  }

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className} cursor-zoom-in`}
        loading="lazy"
        onClick={() => setOpen(true)}
        onError={() => setLoadError(true)}
      />
      {open && (
        <ImageLightbox
          src={src}
          alt={alt}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
});

/* ------------------------------------------------------------------ */
/*  ImagePill — inline pill for user-attached images                    */
/* ------------------------------------------------------------------ */

export const ImagePill = React.memo(function ImagePill({
  src,
  name,
}: {
  src: string;
  name: string;
}) {
  const [lightbox, setLightbox] = useState(false);
  const [preview, setPreview] = useState<{
    x: number;
    y: number;
    above: boolean;
  } | null>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (!pillRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    const above = rect.top > 260;
    setPreview({
      x: rect.left + rect.width / 2,
      y: above ? rect.top - 8 : rect.bottom + 8,
      above,
    });
  }, []);

  const handleMouseLeave = useCallback(() => setPreview(null), []);

  return (
    <>
      <span
        ref={pillRef}
        onClick={() => setLightbox(true)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex h-[22px] items-center gap-1 rounded-md px-1 mx-0.5 border-[0.5px] border-muted-foreground text-foreground hover:bg-muted cursor-pointer align-middle"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setLightbox(true);
          }
        }}
      >
        <span className="inline-block relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-sm">
          <img
            src={src}
            alt={name}
            draggable={false}
            className="h-full w-full object-cover"
          />
        </span>
        <span className="max-w-[100px] truncate text-[11px] leading-none text-foreground">
          {name}
        </span>
      </span>

      {/* Hover preview portal */}
      {preview &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[1500]"
            style={{
              left: preview.x,
              top: preview.above ? preview.y : undefined,
              bottom: preview.above
                ? undefined
                : `${window.innerHeight - preview.y}px`,
              transform: preview.above
                ? "translate(-50%, -100%)"
                : "translate(-50%, 0)",
            }}
          >
            <img
              src={src}
              alt={name}
              className="max-h-[240px] max-w-[240px] rounded-lg border border-border object-contain bg-card shadow-xl"
            />
          </div>,
          document.body,
        )}

      {lightbox && (
        <ImageLightbox
          src={src}
          alt={name}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  );
});
