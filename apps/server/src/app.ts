import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import type { LoomicAgentFactory } from "./agent/deep-agent.js";
import {
  createAgentPersistenceService,
  type AgentPersistenceService,
} from "./agent/persistence/index.js";
import { createAgentRunService } from "./agent/runtime.js";
import { registerImageProvider, registerVideoProvider } from "./generation/providers/registry.js";
import { ReplicateImageProvider } from "./generation/providers/replicate-image.js";
import { ReplicateVideoProvider } from "./generation/providers/replicate-video.js";
import { GoogleImageProvider } from "./generation/providers/google-image.js";
import { GoogleVideoProvider } from "./generation/providers/google-video.js";
import {
  createViewerService,
  type ViewerService,
} from "./features/bootstrap/ensure-user-foundation.js";
import {
  createCanvasService,
  type CanvasService,
} from "./features/canvas/canvas-service.js";
import {
  createBrandKitService,
  type BrandKitService,
} from "./features/brand-kit/brand-kit-service.js";
import {
  createProjectService,
  type ProjectService,
} from "./features/projects/project-service.js";
import {
  createChatService,
  type ChatService,
} from "./features/chat/chat-service.js";
import {
  createThreadService,
  type ThreadService,
} from "./features/chat/thread-service.js";
import {
  createAgentRunMetadataService,
  type AgentRunMetadataService,
} from "./features/agent-runs/agent-run-service.js";
import {
  createSettingsService,
  type SettingsService,
} from "./features/settings/settings-service.js";
import {
  createUploadService,
  type UploadService,
} from "./features/uploads/upload-service.js";
import { type ServerEnv, loadServerEnv } from "./config/env.js";
import { createPgmqClient } from "./queue/pgmq-client.js";
import {
  createCreditService,
  type CreditService,
} from "./features/credits/credit-service.js";
import {
  createTierGuard,
  type TierGuard,
} from "./features/credits/tier-guard.js";
import {
  createJobService,
  type JobService,
} from "./features/jobs/job-service.js";
import { registerCreditRoutes } from "./http/credits.js";
import { registerFontsRoutes } from "./http/fonts.js";
import { registerJobRoutes } from "./http/jobs.js";
import { registerBrandKitRoutes } from "./http/brand-kits.js";
import { registerCanvasRoutes } from "./http/canvases.js";
import { registerChatRoutes } from "./http/chat.js";
import { registerGenerateRoutes } from "./http/generate.js";
import { registerHealthRoutes } from "./http/health.js";
import { registerImageProxyRoute } from "./http/image-proxy.js";
import { registerModelRoutes } from "./http/models.js";
import { registerImageModelRoutes } from "./http/image-models.js";
import { registerVideoModelRoutes } from "./http/video-models.js";
import { registerProjectRoutes } from "./http/projects.js";
import { registerRunRoutes } from "./http/runs.js";
import { registerSettingsRoutes } from "./http/settings.js";
import { registerUploadRoutes } from "./http/uploads.js";
import { registerSkillRoutes } from "./http/skills.js";
import { registerViewerRoutes } from "./http/viewer.js";
import { ConnectionManager } from "./ws/connection-manager.js";
import { registerWsRoute } from "./ws/handler.js";
import { createAdminSupabaseClient } from "./supabase/admin.js";
import {
  createSupabaseRequestAuthenticator,
  createUserSupabaseClientFactory,
  type RequestAuthenticator,
} from "./supabase/user.js";

export type BuildAppOptions = {
  agentFactory?: LoomicAgentFactory;
  agentModel?: BaseLanguageModel | string;
  agentPersistenceService?: AgentPersistenceService;
  agentRunMetadataService?: AgentRunMetadataService;
  auth?: RequestAuthenticator;
  brandKitService?: BrandKitService;
  canvasService?: CanvasService;
  chatService?: ChatService;
  connectionManager?: ConnectionManager;
  creditService?: CreditService;
  env?: Partial<ServerEnv>;
  jobService?: JobService;
  tierGuard?: TierGuard;
  uploadService?: UploadService;
  mockEventDelayMs?: number;
  projectService?: ProjectService;
  settingsService?: SettingsService;
  threadService?: ThreadService;
  viewerService?: ViewerService;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = loadServerEnv(options.env);

  // Register generation providers
  if (env.replicateApiToken) {
    registerImageProvider(new ReplicateImageProvider(env.replicateApiToken));
    registerVideoProvider(new ReplicateVideoProvider(env.replicateApiToken));
  }
  if (env.googleApiKey) {
    registerImageProvider(new GoogleImageProvider(env.googleApiKey));
    registerVideoProvider(new GoogleVideoProvider(env.googleApiKey));
  }

  const app = Fastify({
    logger: { level: "info" },
  });
  void app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });
  void app.register(async (instance) => {
    await instance.register(websocket);
    await registerWsRoute(instance, {
      agentRuns,
      agentRunMetadataService,
      auth,
      connectionManager,
      settingsService,
      threadService,
      viewerService,
    });
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
  const brandKitService =
    options.brandKitService ?? createBrandKitService({ createUserClient });
  const canvasService =
    options.canvasService ?? createCanvasService({ createUserClient });
  const threadService =
    options.threadService ?? createThreadService({ createUserClient });
  const chatService =
    options.chatService ?? createChatService({ createUserClient, threadService });
  const agentRunMetadataService =
    options.agentRunMetadataService ??
    createAgentRunMetadataService({ getAdminClient });
  const agentPersistenceService =
    options.agentPersistenceService ?? createAgentPersistenceService(env);
  const settingsService =
    options.settingsService ?? createSettingsService({ createUserClient });
  const uploadService =
    options.uploadService ?? createUploadService({ createUserClient });
  const pgmq = env.supabaseDbUrl
    ? createPgmqClient(env.supabaseDbUrl)
    : undefined;
  const jobService =
    options.jobService ??
    (pgmq
      ? createJobService({ createUserClient, getAdminClient, pgmq })
      : undefined);
  const creditService =
    options.creditService ?? createCreditService({ getAdminClient });
  const tierGuard =
    options.tierGuard ?? createTierGuard({ getAdminClient });
  const connectionManager = options.connectionManager ?? new ConnectionManager();
  const agentRuns = createAgentRunService({
    agentPersistenceService,
    ...(options.agentFactory ? { agentFactory: options.agentFactory } : {}),
    agentRunMetadataService,
    connectionManager,
    createUserClient,
    ...(options.agentModel ? { model: options.agentModel } : {}),
    ...(options.mockEventDelayMs === undefined
      ? {}
      : { eventDelayMs: options.mockEventDelayMs }),
    env,
    ...(jobService ? { jobService } : {}),
    viewerService,
  });

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
      reply.header("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
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
  void registerFontsRoutes(app, { env });
  void registerImageProxyRoute(app);
  void registerRunRoutes(app, agentRuns, {
    agentRunMetadataService,
    auth,
    settingsService,
    threadService,
    viewerService,
  });
  void registerViewerRoutes(app, {
    auth,
    createUserClient,
    creditService,
    viewerService,
  });
  void registerBrandKitRoutes(app, {
    auth,
    brandKitService,
  });
  void registerProjectRoutes(app, {
    auth,
    projectService,
  });
  void registerCanvasRoutes(app, {
    auth,
    canvasService,
  });
  void registerSettingsRoutes(app, {
    auth,
    settingsService,
    viewerService,
  });
  void registerModelRoutes(app, env);
  void registerImageModelRoutes(app, { auth, creditService, viewerService });
  void registerVideoModelRoutes(app, { auth, creditService, viewerService });
  void registerChatRoutes(app, {
    auth,
    chatService,
  });
  void registerUploadRoutes(app, {
    auth,
    uploadService,
    viewerService,
  });
  void registerGenerateRoutes(app, { auth, uploadService, viewerService });
  void registerCreditRoutes(app, { auth, creditService, viewerService });
  if (jobService) {
    void registerJobRoutes(app, { auth, creditService, jobService, tierGuard, viewerService });
  }
  void registerSkillRoutes(app, { auth, createUserClient, viewerService });

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
