"use client";

import { useCallback, useRef, useState } from "react";

import type { ImageArtifact } from "@loomic/shared";

import { generateImageDirect } from "../lib/server-api";
import { insertImageOnCanvas } from "../lib/canvas-elements";

type CanvasImageGenPanelProps = {
  accessToken: string;
  excalidrawApi: any;
  onClose: () => void;
};

export function CanvasImageGenPanel({
  accessToken,
  excalidrawApi,
  onClose,
}: CanvasImageGenPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const result = await generateImageDirect(accessTokenRef.current, prompt.trim());

      if (excalidrawApi) {
        const artifact: ImageArtifact = {
          type: "image",
          url: result.url,
          mimeType: result.mimeType,
          width: result.width,
          height: result.height,
        };
        await insertImageOnCanvas(excalidrawApi, artifact);
      }

      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, excalidrawApi]);

  return (
    <div className="w-80 rounded-xl bg-white shadow-xl border border-neutral-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#2F3640]">AI Image</h3>
        <button
          onClick={onClose}
          className="text-[#A4A9B2] hover:text-[#2F3640] transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleGenerate();
          }
        }}
        placeholder="Describe the image you want to create..."
        className="w-full h-20 resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm text-[#2F3640] placeholder:text-[#A4A9B2] focus:outline-none focus:ring-1 focus:ring-neutral-400"
        disabled={loading}
      />

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <button
        onClick={() => void handleGenerate()}
        disabled={!prompt.trim() || loading}
        className="mt-3 w-full rounded-lg bg-foreground text-background py-2 text-sm font-medium transition-opacity disabled:opacity-40 hover:opacity-90"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
            Generating...
          </span>
        ) : (
          "Generate"
        )}
      </button>
    </div>
  );
}
