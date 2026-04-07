/**
 * Chat sub-components barrel export.
 *
 * These components were extracted from the monolithic chat-message.tsx (1205 lines)
 * and chat-sidebar.tsx (936 lines) to improve:
 * - Bundle granularity and tree-shaking
 * - Per-component memoization
 * - Independent error isolation
 * - Code readability and maintainability
 */

export { ImageLightbox, ChatImage, ImagePill } from "./image-lightbox";
export { MentionPill } from "./mention-pill";
export { ThinkingBlockView } from "./thinking-block-view";
export { MarkdownRenderer } from "./markdown-renderer";
export { ToolBlockView } from "./tool-block-view";
export { MessageErrorBoundary } from "./message-error-boundary";
export { MessageList } from "./message-list";
