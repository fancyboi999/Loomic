import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { HumanMessage } from "@langchain/core/messages";
import type {
  RunCancelResponse,
  RunCreateRequest,
  RunCreateResponse,
  StreamEvent,
} from "@loomic/shared";

import type { ServerEnv } from "../config/env.js";
import type { AgentRunMetadataService } from "../features/agent-runs/agent-run-service.js";
import type { JobService } from "../features/jobs/job-service.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { AuthenticatedUser, UserSupabaseClient } from "../supabase/user.js";
import type { ConnectionManager } from "../ws/connection-manager.js";
import type { SubmitImageJobFn } from "./tools/image-generate.js";
import {
  type LoomicAgent,
  type LoomicAgentFactory,
  createLoomicDeepAgent,
} from "./deep-agent.js";
import type { AgentPersistenceService } from "./persistence/index.js";
import { adaptDeepAgentStream } from "./stream-adapter.js";

type RuntimeRunStatus =
  | "accepted"
  | "canceled"
  | "completed"
  | "failed"
  | "running";

type RuntimeRunRecord = RunCreateRequest & {
  accessToken?: string;
  consumed: boolean;
  controller: AbortController;
  imageModel?: string;
  modelOverride?: string;
  runId: string;
  status: RuntimeRunStatus;
  threadId?: string;
  userId?: string;
};

type CreateAgentRuntimeOptions = {
  agentPersistenceService?: AgentPersistenceService;
  agentFactory?: LoomicAgentFactory;
  agentRunMetadataService?: AgentRunMetadataService;
  connectionManager?: ConnectionManager;
  createUserClient?: (accessToken: string) => unknown;
  env: ServerEnv;
  eventDelayMs?: number;
  jobService?: JobService;
  model?: BaseLanguageModel | string;
  now?: () => string;
  runIdFactory?: () => string;
  viewerService?: ViewerService;
};

export type AgentRunService = ReturnType<typeof createAgentRunService>;

export function createAgentRunService(options: CreateAgentRuntimeOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  const runs = new Map<string, RuntimeRunRecord>();
  const runIdFactory =
    options.runIdFactory ??
    (() => randomUUID());

  const resolvedAgentFactory: LoomicAgentFactory =
    options.agentFactory ??
    ((agentOptions) =>
      createLoomicDeepAgent({
        ...agentOptions,
        ...(options.createUserClient
          ? { createUserClient: options.createUserClient }
          : {}),
      }));

  return {
    cancelRun(runId: string): RunCancelResponse | null {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }

      if (!run.controller.signal.aborted) {
        run.controller.abort();
      }

      run.status = "canceled";
      return {
        runId,
        status: "canceled",
      };
    },

    createRun(
      input: RunCreateRequest,
      runOptions?: { accessToken?: string; imageModel?: string; model?: string; threadId?: string; userId?: string },
    ): RunCreateResponse {
      const runId = runIdFactory();

      runs.set(runId, {
        ...input,
        ...(runOptions?.accessToken ? { accessToken: runOptions.accessToken } : {}),
        consumed: false,
        controller: new AbortController(),
        ...(runOptions?.imageModel ? { imageModel: runOptions.imageModel } : {}),
        ...(runOptions?.model ? { modelOverride: runOptions.model } : {}),
        ...(runOptions?.threadId ? { threadId: runOptions.threadId } : {}),
        ...(runOptions?.userId ? { userId: runOptions.userId } : {}),
        runId,
        status: "accepted",
      });

      return {
        conversationId: input.conversationId,
        runId,
        sessionId: input.sessionId,
        status: "accepted",
      };
    },

    hasRun(runId: string) {
      return runs.has(runId);
    },

    async *streamRun(runId: string): AsyncGenerator<StreamEvent> {
      const run = runs.get(runId);
      if (!run) {
        throw new Error(`Run not found: ${runId}`);
      }

      if (run.consumed) {
        return;
      }

      run.consumed = true;
      run.status = "running";

      try {
        await updatePersistedRunStatus(
          options.agentRunMetadataService,
          run,
          "running",
        );
      } catch (error) {
        const failedEvent = toFailedEvent(runId, now, error);
        run.status = "failed";
        yield failedEvent;
        return;
      }

      let persistence: Awaited<
        ReturnType<NonNullable<AgentPersistenceService["getPersistence"]>>
      > | null = null;
      try {
        persistence =
          run.threadId && options.agentPersistenceService
            ? await options.agentPersistenceService.getPersistence()
            : null;
      } catch (error) {
        const failedEvent = toFailedEvent(runId, now, error);
        run.status = "failed";
        await updatePersistedRunFailure(
          options.agentRunMetadataService,
          run,
          now,
          error,
        );
        yield failedEvent;
        return;
      }

      if (run.threadId && !persistence) {
        const failedEvent = toFailedEvent(
          runId,
          now,
          new Error("SUPABASE_DB_URL is required for persisted agent threads."),
        );
        run.status = "failed";
        await updatePersistedRunFailure(
          options.agentRunMetadataService,
          run,
          now,
          new Error("SUPABASE_DB_URL is required for persisted agent threads."),
        );
        yield failedEvent;
        return;
      }

      // Build submitImageJob closure for async image generation via PGMQ
      let submitImageJob: SubmitImageJobFn | undefined;
      if (options.jobService && options.createUserClient && run.accessToken && run.userId) {
        const jobSvc = options.jobService;
        const createClient = options.createUserClient;
        const accessToken = run.accessToken;
        const userId = run.userId;
        const canvasId = run.canvasId;

        submitImageJob = async (input) => {
          // Look up personal workspace directly — the viewer is already
          // bootstrapped from the normal auth flow, so we skip ensureViewer
          // to avoid its strict email validation on the profile schema.
          const client = createClient(accessToken) as UserSupabaseClient;
          const { data: ws } = await client
            .from("workspaces")
            .select("id")
            .eq("type", "personal")
            .limit(1)
            .single();
          if (!ws?.id) throw new Error("No personal workspace found");

          const user: AuthenticatedUser = {
            id: userId,
            accessToken,
            email: "",
            userMetadata: {},
          };
          const job = await jobSvc.createJob(user, {
            workspaceId: ws.id,
            ...(canvasId ? { canvasId } : {}),
            jobType: "image_generation",
            payload: {
              prompt: input.prompt,
              title: input.title,
              model: input.model,
              aspect_ratio: input.aspectRatio,
              ...(input.inputImages ? { input_images: input.inputImages } : {}),
            },
          });

          // Poll until terminal state
          const POLL_INTERVAL = 2000;
          const MAX_WAIT = 120_000; // 2 minutes
          const start = Date.now();

          while (Date.now() - start < MAX_WAIT) {
            await delay(POLL_INTERVAL);

            if (run.controller.signal.aborted) {
              throw new Error("Run was canceled");
            }

            const current = await jobSvc.getJobAdmin(job.id);

            if (current.status === "succeeded" && current.result) {
              const result = current.result as {
                signed_url?: string;
                width?: number;
                height?: number;
                mime_type?: string;
              };
              return {
                jobId: job.id,
                imageUrl: result.signed_url ?? "",
                width: result.width ?? 1024,
                height: result.height ?? 1024,
                mimeType: result.mime_type ?? "image/png",
              };
            }

            if (current.status === "dead_letter" || current.status === "canceled") {
              return {
                jobId: job.id,
                error: current.error_message ?? `Job ${current.status}`,
              };
            }

            // "failed" with attempts exhausted
            if (
              current.status === "failed" &&
              current.attempt_count >= current.max_attempts
            ) {
              return {
                jobId: job.id,
                error: current.error_message ?? "Job failed after max retries",
              };
            }
          }

          return {
            jobId: job.id,
            error: `Job timed out after ${MAX_WAIT / 1000}s`,
          };
        };
      }

      let agent: LoomicAgent;
      try {
        const resolvedModel = run.modelOverride
          ? `openai:${run.modelOverride}`
          : options.model;

        // Build persistImage closure using the user's Supabase client.
        // Client creation is deferred into the closure so it only runs
        // when an image is actually generated (avoids throwing in tests
        // that don't configure Supabase env vars).
        let persistImage: ((url: string, mime: string, prompt: string) => Promise<string>) | undefined;
        if (options.createUserClient && run.accessToken) {
          const createClient = options.createUserClient;
          const accessToken = run.accessToken;
          persistImage = async (sourceUrl, mimeType, prompt) => {
            const client = createClient(accessToken) as UserSupabaseClient;
            const response = await fetch(sourceUrl);
            if (!response.ok) throw new Error(`Download failed: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            const ext = mimeType === "image/webp" ? "webp" : "png";
            const slug = prompt.slice(0, 40).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
            const fileName = `gen-${slug}-${Date.now()}.${ext}`;

            const { data: ws } = await client
              .from("workspaces")
              .select("id")
              .eq("type", "personal")
              .limit(1)
              .single();
            const workspaceId = ws?.id ?? "default";
            const objectPath = `${workspaceId}/${Date.now()}-${fileName}`;

            const { error: uploadError } = await client.storage
              .from("project-assets")
              .upload(objectPath, buffer, { contentType: mimeType, upsert: false });
            if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

            const { data: urlData } = client.storage
              .from("project-assets")
              .getPublicUrl(objectPath);

            return urlData.publicUrl;
          };
        }

        // Resolve brand kit ID from canvas → project → brand_kit_id
        let brandKitId: string | null = null;
        if (run.canvasId && run.accessToken && options.createUserClient) {
          try {
            const client = options.createUserClient(run.accessToken) as any;
            const { data: canvas } = await client
              .from("canvases")
              .select("project_id")
              .eq("id", run.canvasId)
              .maybeSingle();

            if (canvas?.project_id) {
              const { data: project } = await client
                .from("projects")
                .select("brand_kit_id")
                .eq("id", canvas.project_id)
                .maybeSingle();
              brandKitId = project?.brand_kit_id ?? null;
            }
          } catch (err) {
            console.warn("Failed to resolve brand kit ID:", err);
          }
        }

        agent = resolvedAgentFactory({
          ...(brandKitId ? { brandKitId } : {}),
          ...(run.canvasId ? { canvasId: run.canvasId } : {}),
          ...(persistence ? { checkpointer: persistence.checkpointer } : {}),
          ...(options.connectionManager ? { connectionManager: options.connectionManager } : {}),
          env: options.env,
          ...(run.imageModel ? { imageModel: run.imageModel } : {}),
          ...(resolvedModel ? { model: resolvedModel } : {}),
          ...(persistImage ? { persistImage } : {}),
          ...(submitImageJob ? { submitImageJob } : {}),
          ...(persistence ? { store: persistence.store } : {}),
        });
      } catch (error) {
        const failedEvent = toFailedEvent(runId, now, error);
        run.status = "failed";
        await updatePersistedRunFailure(options.agentRunMetadataService, run, now, error);
        yield failedEvent;
        return;
      }

      let stream: AsyncIterable<unknown>;
      try {
        const hasAttachments = run.attachments && run.attachments.length > 0;
        const userMessage = hasAttachments
          ? new HumanMessage({
              content: [
                { type: "text" as const, text: run.prompt },
                ...run.attachments!.map((a) => ({
                  type: "image" as const,
                  source_type: "url" as const,
                  url: a.url,
                  mimeType: a.mimeType,
                })),
              ],
            })
          : new HumanMessage(run.prompt);

        stream = agent.streamEvents(
          {
            messages: [userMessage],
          },
          {
            ...(run.threadId || run.canvasId || run.accessToken || run.userId
              ? {
                  configurable: {
                    ...(run.threadId ? { thread_id: run.threadId } : {}),
                    ...(run.canvasId ? { canvas_id: run.canvasId } : {}),
                    ...(run.accessToken ? { access_token: run.accessToken } : {}),
                    ...(run.userId ? { user_id: run.userId } : {}),
                  },
                }
              : {}),
            signal: run.controller.signal,
            version: "v2",
          },
        );
      } catch (error) {
        const failedEvent = toFailedEvent(runId, now, error);
        run.status = "failed";
        await updatePersistedRunFailure(options.agentRunMetadataService, run, now, error);
        yield failedEvent;
        return;
      }

      for await (const event of adaptDeepAgentStream({
        conversationId: run.conversationId,
        now,
        runId,
        sessionId: run.sessionId,
        signal: run.controller.signal,
        stream,
      })) {
        run.status = mapEventToStatus(event);
        try {
          await syncPersistedRunFromEvent(
            options.agentRunMetadataService,
            run,
            event,
            now,
          );
        } catch (error) {
          const failedEvent = toFailedEvent(runId, now, error);
          run.status = "failed";
          yield failedEvent;
          return;
        }
        yield event;

        if (!isTerminalEvent(event) && options.eventDelayMs) {
          try {
            await delay(options.eventDelayMs, undefined, {
              signal: run.controller.signal,
            });
          } catch {
            run.status = "canceled";
            yield {
              runId,
              timestamp: now(),
              type: "run.canceled",
            };
            return;
          }
        }
      }
    },
  };
}


function isTerminalEvent(event: StreamEvent) {
  return (
    event.type === "run.canceled" ||
    event.type === "run.completed" ||
    event.type === "run.failed"
  );
}

function mapEventToStatus(event: StreamEvent): RuntimeRunStatus {
  switch (event.type) {
    case "run.canceled":
      return "canceled";
    case "run.completed":
      return "completed";
    case "run.failed":
      return "failed";
    default:
      return "running";
  }
}

function toFailedEvent(
  runId: string,
  now: () => string,
  error: unknown,
): StreamEvent {
  return {
    error: {
      code: "run_failed",
      message:
        error instanceof Error ? error.message : "Deep agent runtime failed.",
    },
    runId,
    timestamp: now(),
    type: "run.failed",
  };
}

async function updatePersistedRunStatus(
  agentRunMetadataService: AgentRunMetadataService | undefined,
  run: RuntimeRunRecord,
  status: "running" | "completed",
  options?: {
    completedAt?: string;
  },
) {
  if (!agentRunMetadataService || !run.threadId) {
    return;
  }

  await agentRunMetadataService.updateRun({
    ...(options?.completedAt ? { completedAt: options.completedAt } : {}),
    runId: run.runId,
    status,
  });
}

async function updatePersistedRunFailure(
  agentRunMetadataService: AgentRunMetadataService | undefined,
  run: RuntimeRunRecord,
  now: () => string,
  error: unknown,
) {
  if (!agentRunMetadataService || !run.threadId) {
    return;
  }

  await agentRunMetadataService.updateRun({
    completedAt: now(),
    errorCode: "run_failed",
    errorMessage:
      error instanceof Error ? error.message : "Deep agent runtime failed.",
    runId: run.runId,
    status: "failed",
  });
}

async function syncPersistedRunFromEvent(
  agentRunMetadataService: AgentRunMetadataService | undefined,
  run: RuntimeRunRecord,
  event: StreamEvent,
  now: () => string,
) {
  if (event.type === "run.completed") {
    await updatePersistedRunStatus(agentRunMetadataService, run, "completed", {
      completedAt: now(),
    });
    return;
  }

  if (event.type === "run.failed") {
    await updatePersistedRunFailure(
      agentRunMetadataService,
      run,
      now,
      new Error(event.error.message),
    );
  }
}
