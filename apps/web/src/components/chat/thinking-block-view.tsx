"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, { useState } from "react";

type ThinkingBlockViewProps = {
  thinking: string;
  isStreaming: boolean;
};

/**
 * Collapsible thinking block with streaming animation.
 *
 * - During streaming: shows pulsing sparkle icon + thinking text
 * - After streaming: collapses into a toggleable "Thought for a moment" button
 *
 * Memoized to avoid re-rendering non-streaming thinking blocks when new
 * message deltas arrive in the same message.
 */
export const ThinkingBlockView = React.memo(function ThinkingBlockView({
  thinking,
  isStreaming,
}: ThinkingBlockViewProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mb-2 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        aria-expanded={expanded || isStreaming}
        aria-label={isStreaming ? "AI is thinking" : "Toggle thinking content"}
      >
        {isStreaming ? (
          <motion.div
            className="flex items-center gap-1.5"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="currentColor"
              className="text-accent"
            >
              <path d="M7.314 1.451a5.527 5.527 0 0 0 5.519 5.242v.614a5.527 5.527 0 0 0-5.519 5.242l-.007.284h-.614l-.007-.284a5.527 5.527 0 0 0-5.519-5.242v-.614a5.527 5.527 0 0 0 5.519-5.242l.007-.284h.614zm4.31 8.125c.042.835.733 1.5 1.58 1.5v.176c-.847 0-1.538.664-1.58 1.5l-.002.081h-.176l-.002-.081a1.58 1.58 0 0 0-1.579-1.5v-.176c.846 0 1.537-.665 1.58-1.5l.001-.08h.176zM7 4.204A6.6 6.6 0 0 1 4.205 7 6.6 6.6 0 0 1 7 9.795 6.6 6.6 0 0 1 9.794 7 6.6 6.6 0 0 1 7 4.204" />
            </svg>
            <span>Thinking...</span>
          </motion.div>
        ) : (
          <>
            <motion.svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <path
                d="M4.5 2.5l3.5 3.5-3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
            <span>Thought for a moment</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {(expanded || isStreaming) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-1.5 overflow-hidden"
          >
            <div className="border-l-2 border-accent/30 pl-3 text-xs leading-relaxed text-muted-foreground/60 whitespace-pre-wrap">
              {thinking || "\u2014"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
