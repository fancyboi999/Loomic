/**
 * Structured logger for WebSocket + Agent pipeline.
 *
 * Outputs JSON lines compatible with Fastify's pino logger.
 * Each log entry includes: scope, event, timing (ms since scope start),
 * and optional context fields.
 *
 * Usage:
 *   const log = createPipelineLogger("ws");
 *   log.info("connected", { userId });
 *   log.warn("auth_failed", { reason: "token expired" });
 *   log.lap("thread_resolved");  // auto-tracks elapsed ms
 */

type LogLevel = "info" | "warn" | "error";

const LEVEL_NUM: Record<LogLevel, number> = { info: 30, warn: 40, error: 50 };

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
    const entry = {
      level: LEVEL_NUM[level],
      time: Date.now(),
      scope,
      event,
      ...baseCtx,
      ...ctx,
    };
    // Use process.stdout for consistent output (not swallowed by Fastify encapsulation)
    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  return {
    info: (event, ctx) => emit("info", event, ctx),
    warn: (event, ctx) => emit("warn", event, ctx),
    error: (event, ctx) => emit("error", event, ctx),
    lap: (event, ctx) => emit("info", event, { ...ctx, elapsed_ms: Date.now() - t0 }),
    elapsed: () => Date.now() - t0,
  };
}
