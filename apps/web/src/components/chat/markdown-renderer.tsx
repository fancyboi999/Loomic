"use client";

import React, { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { ChatImage } from "./image-lightbox";
import { isImageUrl } from "./utils";

/**
 * Pre-built markdown component overrides.
 *
 * Defined as a module-level constant so every MarkdownRenderer instance
 * shares the same reference — avoids re-creating the components map on
 * every render, which would force ReactMarkdown to remount its tree.
 */
const markdownComponents: Components = {
  a({ href, children }) {
    if (href && isImageUrl(href)) {
      return (
        <ChatImage
          src={href}
          alt={typeof children === "string" ? children : "Image"}
          className="my-2 max-w-[280px] rounded-lg border border-border"
        />
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-foreground underline break-all"
      >
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    return (
      <ChatImage
        src={typeof src === "string" ? src : ""}
        alt={alt ?? "Image"}
        className="my-2 max-w-[280px] rounded-lg border border-border"
      />
    );
  },
};

/** Stable remarkPlugins array to prevent ReactMarkdown remount */
const remarkPlugins = [remarkGfm];

type MarkdownRendererProps = {
  /** Raw markdown text to render */
  text: string;
  /** Whether to show the streaming cursor after this block */
  showCursor?: boolean;
};

/**
 * Memoized markdown renderer for chat messages.
 *
 * Performance notes:
 * - remarkPlugins and components are module-level constants (no re-creation)
 * - React.memo prevents re-render when text hasn't changed
 * - During streaming, text changes every delta — the memo check is O(1) string comparison
 */
export const MarkdownRenderer = React.memo(function MarkdownRenderer({
  text,
  showCursor,
}: MarkdownRendererProps) {
  // Guard against empty/whitespace-only text producing empty markdown output
  const safeText = text || "";

  return (
    <div className="markdown-content text-sm leading-[1.6] text-foreground">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={markdownComponents}
      >
        {safeText}
      </ReactMarkdown>
      {showCursor && (
        <span className="inline-block w-[2px] h-[14px] ml-0.5 -mb-[2px] bg-foreground animate-pulse rounded-full" />
      )}
    </div>
  );
});
