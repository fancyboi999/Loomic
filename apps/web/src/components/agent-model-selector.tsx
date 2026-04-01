"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAgentModel } from "@/hooks/use-agent-model";
import { fetchModels } from "@/lib/server-api";

type ModelOption = { id: string; name: string; provider: string };

// Sparkle icon SVG path from design spec
const SPARKLE_ICON_PATH =
  "M7.314 1.451a5.527 5.527 0 0 0 5.519 5.242v.614a5.527 5.527 0 0 0-5.519 5.242l-.007.284h-.614l-.007-.284a5.527 5.527 0 0 0-5.519-5.242v-.614a5.527 5.527 0 0 0 5.519-5.242l.007-.284h.614zm4.31 8.125c.042.835.733 1.5 1.58 1.5v.176c-.847 0-1.538.664-1.58 1.5l-.002.081h-.176l-.002-.081a1.58 1.58 0 0 0-1.579-1.5v-.176c.846 0 1.537-.665 1.58-1.5l.001-.08h.176zM7 4.204A6.6 6.6 0 0 1 4.205 7 6.6 6.6 0 0 1 7 9.795 6.6 6.6 0 0 1 9.794 7 6.6 6.6 0 0 1 7 4.204";

const CHECK_PATH =
  "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0";

function ProviderLogo({ provider }: { provider: string }) {
  if (provider === "openai") {
    return (
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073M13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
      </svg>
    );
  }
  if (provider === "google") {
    return (
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053z" />
      </svg>
    );
  }
  return null;
}

export function AgentModelSelector({ compact }: { compact?: boolean } = {}) {
  const { model, setModel } = useAgentModel();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch available models
  useEffect(() => {
    fetchModels()
      .then((data) => setModels(data.models))
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const isActive = model !== null;
  const selectedModel = models.find((m) => m.id === model);
  const displayLabel = selectedModel ? selectedModel.name : "Agent";

  // Auto-positioning popover (above or below based on available space)
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const popoverHeight = 360;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < popoverHeight && rect.top > spaceBelow;

    if (openAbove) {
      setPopoverStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
        zIndex: 9999,
      });
    } else {
      setPopoverStyle({
        position: "fixed",
        top: rect.bottom + 8,
        left: rect.left,
        zIndex: 9999,
      });
    }
  }, [open]);

  // Deduplicate provider list from actual models
  const providers = [...new Set(models.map((m) => m.provider))];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center gap-1 box-border rounded-full border-[0.5px] cursor-pointer font-inter transition-[border-color,background-color] duration-100 ease-in-out ${
          compact ? "h-8 px-2.5" : "h-8 px-3"
        } ${
          isActive
            ? "border-[#dbeb56] bg-[#dbeb56]/10 text-foreground hover:bg-[#dbeb56]/20 active:bg-[#dbeb56]/30"
            : "border-border text-foreground hover:bg-muted"
        } bg-transparent`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          fill="none"
          viewBox="0 0 14 14"
          className="[&_path]:fill-current"
        >
          <path fill="currentColor" d={SPARKLE_ICON_PATH} />
        </svg>
        <span className={compact ? "text-[11px]" : "text-xs"}>{displayLabel}</span>
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="w-56 rounded-xl border border-border bg-popover p-2 shadow-lg"
          >
            <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
              Agent Model
            </div>
            {/* Auto option */}
            <button
              type="button"
              onClick={() => {
                setModel(null);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                !isActive
                  ? "bg-accent/10 text-accent-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <span className="flex-1 text-left">
                Auto (workspace default)
              </span>
              {!isActive && (
                <svg
                  className="h-3 w-3 text-accent-foreground"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d={CHECK_PATH} />
                </svg>
              )}
            </button>
            {/* Group by provider */}
            {providers.map((provider) => {
              const providerModels = models.filter(
                (m) => m.provider === provider,
              );
              if (providerModels.length === 0) return null;
              return (
                <div key={provider} className="mt-2">
                  <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    <ProviderLogo provider={provider} />
                    {provider === "openai" ? "OpenAI" : provider === "google" ? "Google" : provider}
                  </div>
                  {providerModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setModel(m.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                        model === m.id
                          ? "bg-accent/10 text-accent-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      <span className="flex-1 text-left">{m.name}</span>
                      {model === m.id && (
                        <svg
                          className="h-3 w-3 text-accent-foreground"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path d={CHECK_PATH} />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
