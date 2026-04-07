"use client";

import React from "react";

type MessageErrorBoundaryProps = {
  children: React.ReactNode;
  /** Message ID for error reporting context */
  messageId: string;
};

type MessageErrorBoundaryState = {
  error: Error | null;
};

/**
 * Lightweight error boundary scoped to a single chat message.
 *
 * Unlike the global ErrorBoundary, this is designed to isolate rendering
 * failures per message so that a single malformed contentBlock (e.g. bad
 * markdown, broken tool output) doesn't take down the entire chat panel.
 *
 * The fallback is intentionally minimal -- a small inline notice that
 * blends with the chat flow rather than blocking it.
 */
export class MessageErrorBoundary extends React.Component<
  MessageErrorBoundaryProps,
  MessageErrorBoundaryState
> {
  constructor(props: MessageErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): MessageErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log with message ID for easier debugging of which message content
    // caused the crash -- critical for production triage
    console.error(
      `[chat-message] render error in message ${this.props.messageId}:`,
      error,
      errorInfo,
    );
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
        <svg
          className="h-3.5 w-3.5 shrink-0 text-destructive/60"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <span>消息渲染异常</span>
        <button
          type="button"
          onClick={this.reset}
          className="ml-auto text-xs text-foreground/60 hover:text-foreground underline transition-colors"
        >
          重试
        </button>
      </div>
    );
  }
}
