import type { FastifyInstance } from "fastify";

import type { ServerEnv } from "../config/env.js";
import type { MockRunStore } from "../mock/mock-run.js";

export async function registerSseRoutes(
  app: FastifyInstance,
  mockRuns: MockRunStore,
  env: ServerEnv,
) {
  app.get("/api/agent/runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    if (!mockRuns.hasRun(runId)) {
      return reply.code(404).send({
        message: `Run not found: ${runId}`,
      });
    }

    const corsOrigin = resolveResponseOrigin(
      request.headers.origin,
      request.headers.host,
      env.webOrigin,
    );

    reply.hijack();
    reply.raw.writeHead(200, {
      ...(corsOrigin ? { "access-control-allow-origin": corsOrigin } : {}),
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    });

    try {
      for await (const event of mockRuns.streamRun(runId)) {
        reply.raw.write(formatSseFrame(event));
      }
    } finally {
      reply.raw.end();
    }
  });
}

function formatSseFrame(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function resolveResponseOrigin(
  origin: string | undefined,
  host: string | undefined,
  webOrigin: string,
) {
  if (!origin) {
    return null;
  }

  if (origin === webOrigin) {
    return origin;
  }

  if (origin === "null" && isLoopbackHost(host)) {
    return origin;
  }

  return null;
}

function isLoopbackHost(host: string | undefined) {
  if (!host) {
    return false;
  }

  if (host.startsWith("[")) {
    return host.startsWith("[::1]");
  }

  const [hostname] = host.split(":");
  return (
    hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
  );
}
