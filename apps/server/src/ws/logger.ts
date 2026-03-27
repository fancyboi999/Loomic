import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Structured logger for WebSocket + Agent pipeline.
 *
 * Outputs JSON lines to both stdout and log file.
 * Each log entry includes: scope, event, timing (ms since scope start),
 * and optional context fields.
 *
 * Log file: apps/server/logs/pipeline.log (JSON lines, append mode)
 *
 * Usage:
 *   const log = createPipelineLogger("ws");
 *   log.info("connected", { userId });
 *   log.warn("auth_failed", { reason: "token expired" });
 *   log.lap("thread_resolved");  // auto-tracks elapsed ms
 */

type LogLevel = "info" | "warn" | "error";

const LEVEL_NUM: Record<LogLevel, number> = { info: 30, warn: 40, error: 50 };
const LEVEL_LABEL: Record<LogLevel, string> = { info: "INFO", warn: "WARN", error: "ERROR" };

// Ensure log directory exists
const LOG_DIR = join(import.meta.dirname ?? ".", "..", "..", "logs");
try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }
const LOG_FILE = join(LOG_DIR, "pipeline.log");

export type PipelineLogger = {
  info: (event: string, ctx?: Record<string, unknown>) => void;
  warn: (event: string, ctx?: Record<string, unknown>) => void;
  error: (event: string, ctx?: Record<string, unknown>) => void;
  /** Log with auto-calculated elapsed time since logger creation */
  lap: (event: string, ctx?: Record<string, unknown>) => void;
  /** Get elapsed ms since logger creation */
  elapsed: () => number;
};

export function createPipelineLogger(
  scope: string,
  baseCtx?: Record<string, unknown>,
): PipelineLogger {
  const t0 = Date.now();

  function emit(level: LogLevel, event: string, ctx?: Record<string, unknown>) {
    const now = Date.now();
    const entry = {
      level: LEVEL_NUM[level],
      time: now,
      scope,
      event,
      ...baseCtx,
      ...ctx,
    };
    const line = JSON.stringify(entry) + "\n";

    // stdout: human-friendly one-liner
    const ts = new Date(now).toISOString().slice(11, 23);
    const ctxStr = ctx ? " " + Object.entries(ctx).map(([k, v]) => `${k}=${v}`).join(" ") : "";
    process.stdout.write(`${ts} [${LEVEL_LABEL[level]}] ${scope}.${event}${ctxStr}\n`);

    // file: structured JSON lines
    try { appendFileSync(LOG_FILE, line); } catch { /* ignore */ }
  }

  return {
    info: (event, ctx) => emit("info", event, ctx),
    warn: (event, ctx) => emit("warn", event, ctx),
    error: (event, ctx) => emit("error", event, ctx),
    lap: (event, ctx) => emit("info", event, { ...ctx, elapsed_ms: Date.now() - t0 }),
    elapsed: () => Date.now() - t0,
  };
}
