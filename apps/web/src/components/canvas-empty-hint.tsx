"use client";

import { useEffect, useRef, useState } from "react";

type CanvasEmptyHintProps = {
  excalidrawApi: any;
  onOpenChat: () => void;
};

/**
 * Floating overlay hint shown when the Excalidraw canvas has no visible
 * elements. Pressing the `C` key opens the chat sidebar and focuses the
 * chat input textarea.
 */
export function CanvasEmptyHint({
  excalidrawApi,
  onOpenChat,
}: CanvasEmptyHintProps) {
  const [hasElements, setHasElements] = useState(false);
  const onOpenChatRef = useRef(onOpenChat);
  onOpenChatRef.current = onOpenChat;

  // Poll the Excalidraw API every 500ms to determine if the canvas contains
  // any non-deleted elements.
  useEffect(() => {
    function check() {
      if (!excalidrawApi) {
        setHasElements(false);
        return;
      }
      const elements: any[] = excalidrawApi.getSceneElements?.() ?? [];
      setHasElements(elements.some((el: any) => !el.isDeleted));
    }

    check();
    const id = setInterval(check, 500);
    return () => clearInterval(id);
  }, [excalidrawApi]);

  // Global keydown listener for the `C` shortcut.
  useEffect(() => {
    if (hasElements) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when the user is typing in an input or textarea.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Also ignore if contentEditable
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        onOpenChatRef.current();

        // The textarea may not be in the DOM yet (sidebar was closed), so
        // retry focus with a short delay.
        requestAnimationFrame(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>(
            "textarea[data-chat-input]",
          );
          if (textarea) {
            textarea.focus();
          } else {
            // Sidebar might animate open; retry once more.
            setTimeout(() => {
              document
                .querySelector<HTMLTextAreaElement>(
                  "textarea[data-chat-input]",
                )
                ?.focus();
            }, 100);
          }
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasElements]);

  if (hasElements) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
      <p className="text-base text-[rgba(0,0,0,0.3)]">
        {"输入你的想法开始创作，或按 "}
        <kbd className="px-1.5 py-0.5 rounded bg-[rgba(0,0,0,0.06)] text-sm">
          C
        </kbd>
        {" 开始对话"}
      </p>
    </div>
  );
}
