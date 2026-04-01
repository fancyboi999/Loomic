"use client";

import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  /** Optional custom fallback UI — receives the error and a reset function */
  fallback?:
    | React.ReactNode
    | ((props: { error: Error; reset: () => void }) => React.ReactNode);
  /** Callback fired when an error is caught — use for logging / telemetry */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Generic React Error Boundary.
 *
 * Catches render-time errors in its subtree and shows a recoverable fallback UI
 * instead of letting the whole page crash to a white screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <Excalidraw ... />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] caught rendering error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Custom fallback — render-prop style or static ReactNode
    const { fallback } = this.props;
    if (typeof fallback === "function") {
      return fallback({ error, reset: this.reset });
    }
    if (fallback !== undefined) {
      return fallback;
    }

    // Default fallback UI
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card px-8 py-10 text-center shadow-card max-w-sm">
          {/* Icon */}
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <svg
              className="h-5 w-5 text-destructive"
              viewBox="0 0 20 20"
              aria-hidden="true"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-medium text-foreground">出错了</h3>
            <p className="text-xs text-muted-foreground">
              {process.env.NODE_ENV === "development"
                ? error.message
                : "页面组件发生异常，请重试或刷新页面"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              重试
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              刷新页面
            </button>
          </div>
        </div>
      </div>
    );
  }
}
