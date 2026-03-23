import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import type { LoomicAgentFactory } from "./agent/deep-agent.js";
import { createAgentRunService } from "./agent/runtime.js";
import {
  createViewerService,
  type ViewerService,
} from "./features/bootstrap/ensure-user-foundation.js";
import {
  createProjectService,
  type ProjectService,
} from "./features/projects/project-service.js";
import { type ServerEnv, loadServerEnv } from "./config/env.js";
import { registerHealthRoutes } from "./http/health.js";
import { registerProjectRoutes } from "./http/projects.js";
import { registerRunRoutes } from "./http/runs.js";
import { registerSseRoutes } from "./http/sse.js";
import { registerViewerRoutes } from "./http/viewer.js";
import { createAdminSupabaseClient } from "./supabase/admin.js";
import {
  createSupabaseRequestAuthenticator,
  createUserSupabaseClientFactory,
  type RequestAuthenticator,
} from "./supabase/user.js";

export type BuildAppOptions = {
  agentFactory?: LoomicAgentFactory;
  agentModel?: BaseLanguageModel | string;
  auth?: RequestAuthenticator;
  env?: Partial<ServerEnv>;
  mockEventDelayMs?: number;
  projectService?: ProjectService;
  viewerService?: ViewerService;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = loadServerEnv(options.env);
  const app = Fastify({
    logger: false,
  });
  const agentRuns = createAgentRunService({
    ...(options.agentFactory ? { agentFactory: options.agentFactory } : {}),
    ...(options.agentModel ? { model: options.agentModel } : {}),
    ...(options.mockEventDelayMs === undefined
      ? {}
      : { eventDelayMs: options.mockEventDelayMs }),
    env,
  });
  const auth = options.auth ?? createSupabaseRequestAuthenticator(env);
  const createUserClient = createUserSupabaseClientFactory(env);
  let adminClient:
    | ReturnType<typeof createAdminSupabaseClient>
    | undefined;
  const getAdminClient = () => {
    adminClient ??= createAdminSupabaseClient(env);
    return adminClient;
  };
  const viewerService =
    options.viewerService ?? createViewerService({ getAdminClient });
  const projectService =
    options.projectService ??
    createProjectService({ createUserClient, viewerService });

  app.addHook("onRequest", async (request, reply) => {
    const corsResult = evaluateCors(request, env.webOrigin);

    if (!corsResult.allowed) {
      return reply.code(403).send({
        message: "Origin not allowed",
      });
    }

    if (corsResult.allowOrigin) {
      reply.header("access-control-allow-origin", corsResult.allowOrigin);
      reply.header("vary", "Origin");
    }

    if (corsResult.isBrowserRequest) {
      reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
      reply.header(
        "access-control-allow-headers",
        resolveAllowedHeaders(
          request.headers["access-control-request-headers"],
        ),
      );
    }

    if (corsResult.isPreflight) {
      return reply.code(204).send();
    }
  });

  void registerHealthRoutes(app, env);
  void registerRunRoutes(app, agentRuns);
  void registerSseRoutes(app, agentRuns, env);
  void registerViewerRoutes(app, {
    auth,
    viewerService,
  });
  void registerProjectRoutes(app, {
    auth,
    projectService,
  });

  return app;
}

type CorsResult = {
  allowed: boolean;
  allowOrigin: string | null;
  isBrowserRequest: boolean;
  isPreflight: boolean;
};

function evaluateCors(request: FastifyRequest, webOrigin: string): CorsResult {
  const origin = request.headers.origin;
  const isPreflight =
    request.method === "OPTIONS" &&
    typeof request.headers["access-control-request-method"] === "string";

  if (!origin) {
    return {
      allowed: true,
      allowOrigin: null,
      isBrowserRequest: false,
      isPreflight,
    };
  }

  if (origin === webOrigin) {
    return {
      allowed: true,
      allowOrigin: origin,
      isBrowserRequest: true,
      isPreflight,
    };
  }

  if (origin === "null" && isLoopbackHost(request.headers.host)) {
    return {
      allowed: true,
      allowOrigin: origin,
      isBrowserRequest: true,
      isPreflight,
    };
  }

  return {
    allowed: false,
    allowOrigin: null,
    isBrowserRequest: true,
    isPreflight,
  };
}

function resolveAllowedHeaders(requestHeaders: string | undefined) {
  return requestHeaders?.trim() || "Content-Type";
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
