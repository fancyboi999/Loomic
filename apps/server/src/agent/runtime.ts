import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { HumanMessage } from "@langchain/core/messages";
import type {
  ImageAttachment,
  ImageGenerationPreference,
  MessageMention,
  RunCancelResponse,
  RunCreateRequest,
  RunCreateResponse,
  StreamEvent,
} from "@loomic/shared";

import type { ServerEnv } from "../config/env.js";
import { createPipelineLogger } from "../ws/logger.js";
import type { AgentRunMetadataService } from "../features/agent-runs/agent-run-service.js";
import type { JobService } from "../features/jobs/job-service.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { AuthenticatedUser, UserSupabaseClient } from "../supabase/user.js";
import type { ConnectionManager } from "../ws/connection-manager.js";
import type { SubmitImageJobFn } from "./tools/image-generate.js";
import type { SubmitVideoJobFn } from "./tools/video-generate.js";
import {
  type LoomicAgent,
  type LoomicAgentFactory,
  createLoomicDeepAgent,
} from "./deep-agent.js";
import type { AgentPersistenceService } from "./persistence/index.js";
import { adaptDeepAgentStream } from "./stream-adapter.js";

/**
 * Build the text portion of a user message, appending <input_images> XML
 * tags when attachments are present so the LLM can reference them by assetId.
 */
export function buildUserMessage(
  prompt: string,
  attachments: ImageAttachment[],
  imageGenerationPreference?: ImageGenerationPreference,
  mentions: MessageMention[] = [],
): { text: string } {
  const xmlBlocks: string[] = [];

  const inputImagesXml = buildInputImagesXml(attachments);
  if (inputImagesXml) xmlBlocks.push(inputImagesXml);

  const imageGenerationPreferenceXml = buildImageGenerationPreferenceXml(
    imageGenerationPreference,
  );
  if (imageGenerationPreferenceXml) xmlBlocks.push(imageGenerationPreferenceXml);

  const mentionXmlBlocks = buildMentionXmlBlocks(mentions);
  xmlBlocks.push(...mentionXmlBlocks);

  if (!xmlBlocks.length) return { text: prompt };
  return { text: `${prompt}\n\n${xmlBlocks.join("\n\n")}` };
}

function buildInputImagesXml(attachments: ImageAttachment[]): string | null {
  if (attachments.length === 0) return null;

  const imageXml = attachments
    .map((attachment, i) => {
      const nameAttr = attachment.name
        ? ` name="${escapeXmlAttribute(attachment.name)}"`
        : "";
      return `<image index="${i + 1}" asset_id="${escapeXmlAttribute(attachment.assetId)}" mime_type="${escapeXmlAttribute(attachment.mimeType)}"${nameAttr} />`;
    })
    .join("\n  ");

  return `<input_images count="${attachments.length}">\n  ${imageXml}\n</input_images>`;
}

function buildImageGenerationPreferenceXml(
  imageGenerationPreference?: ImageGenerationPreference,
): string | null {
  if (
    imageGenerationPreference?.mode !== "manual" ||
    imageGenerationPreference.models.length === 0
  ) {
    return null;
  }

  const modelXml = imageGenerationPreference.models
    .map(
      (model, i) =>
        `<preferred_model index="${i + 1}" id="${escapeXmlAttribute(model)}" />`,
    )
    .join("\n  ");

  return `<human_image_generation_preference mode="manual" count="${imageGenerationPreference.models.length}">\n  ${modelXml}\n</human_image_generation_preference>`;
}

function buildMentionXmlBlocks(mentions: MessageMention[]): string[] {
  const xmlBlocks: string[] = [];

  const mentionedModels = mentions.filter(
    (mention): mention is Extract<MessageMention, { mentionType: "image-model" }> =>
      mention.mentionType === "image-model",
  );
  if (mentionedModels.length > 0) {
    const modelXml = mentionedModels
      .map(
        (mention, i) =>
          `<model index="${i + 1}" id="${escapeXmlAttribute(mention.id)}" display_name="${escapeXmlAttribute(mention.label)}" />`,
      )
      .join("\n  ");

    xmlBlocks.push(
      `<human_image_model_mentions count="${mentionedModels.length}">\n  ${modelXml}\n</human_image_model_mentions>`,
    );
  }

  const mentionedBrandKitAssets = mentions.filter(
    (
      mention,
    ): mention is Extract<MessageMention, { mentionType: "brand-kit-asset" }> =>
      mention.mentionType === "brand-kit-asset",
  );
  if (mentionedBrandKitAssets.length > 0) {
    const assetXml = mentionedBrandKitAssets
      .map((mention, i) => {
        const textContentAttr =
          mention.textContent != null
            ? ` text_content="${escapeXmlAttribute(mention.textContent)}"`
            : "";
        const fileUrlAttr =
          mention.fileUrl != null
            ? ` file_url="${escapeXmlAttribute(mention.fileUrl)}"`
            : "";
        return `<brand_kit_asset index="${i + 1}" id="${escapeXmlAttribute(mention.id)}" type="${escapeXmlAttribute(mention.assetType)}" display_name="${escapeXmlAttribute(mention.label)}"${textContentAttr}${fileUrlAttr} />`;
      })
      .join("\n  ");

    xmlBlocks.push(
      `<human_brand_kit_mentions count="${mentionedBrandKitAssets.length}">\n  ${assetXml}\n</human_brand_kit_mentions>`,
    );
  }

  return xmlBlocks;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Build a lookup map from assetId to base64 data URI.
 * Stored in configurable so tools can resolve assetId references.
 */
export function buildAttachmentDataMap(
  downloaded: Array<{ assetId: string; mimeType: string; base64: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of downloaded) {
    map[d.assetId] = `data:${d.mimeType};base64,${d.base64}`;
  }
  return map;
}

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
      runOptions?: { accessToken?: string; model?: string; threadId?: string; userId?: string },
    ): RunCreateResponse {
      const runId = runIdFactory();
      const { accessToken: _ignoredAccessToken, ...runInput } = input;

      runs.set(runId, {
        ...runInput,
        ...(runOptions?.accessToken ? { accessToken: runOptions.accessToken } : {}),
        consumed: false,
        controller: new AbortController(),
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

      const rlog = createPipelineLogger("runtime", { runId });

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
        rlog.lap("persistence_init");
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

      // Build submitImageJob / submitVideoJob closures for async generation via PGMQ
      let submitImageJob: SubmitImageJobFn | undefined;
      let submitVideoJob: SubmitVideoJobFn | undefined;
      if (options.jobService && options.createUserClient && run.accessToken && run.userId) {
        const jobSvc = options.jobService;
        const createClient = options.createUserClient;
        const accessToken = run.accessToken;
        const userId = run.userId;
        const canvasId = run.canvasId;

        submitImageJob = async (input) => {
          const jobT0 = Date.now();
          const jobLap = (label: string, extra?: Record<string, unknown>) => {
            console.log(`[submitImageJob] ${label} +${Date.now() - jobT0}ms`, extra ? JSON.stringify(extra) : "");
          };

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
          jobLap("job_created", { jobId: job.id });

          // Poll until terminal state
          const POLL_INTERVAL = 2000;
          const MAX_WAIT = 120_000; // 2 minutes
          const start = Date.now();
          let pollCount = 0;

          while (Date.now() - start < MAX_WAIT) {
            await delay(POLL_INTERVAL);
            pollCount++;

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
              jobLap("job_poll_done", { pollCount, status: "succeeded" });
              return {
                jobId: job.id,
                imageUrl: result.signed_url ?? "",
                width: result.width ?? 1024,
                height: result.height ?? 1024,
                mimeType: result.mime_type ?? "image/png",
              };
            }

            if (current.status === "dead_letter" || current.status === "canceled") {
              jobLap("job_poll_done", { pollCount, status: current.status });
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
              jobLap("job_poll_done", { pollCount, status: "failed_max_retries" });
              return {
                jobId: job.id,
                error: current.error_message ?? "Job failed after max retries",
              };
            }
          }

          jobLap("job_poll_done", { pollCount, status: "timeout" });
          return {
            jobId: job.id,
            error: `Job timed out after ${MAX_WAIT / 1000}s`,
          };
        };

        submitVideoJob = async (input) => {
          const jobT0 = Date.now();
          const jobLap = (label: string, extra?: Record<string, unknown>) => {
            console.log(`[submitVideoJob] ${label} +${Date.now() - jobT0}ms`, extra ? JSON.stringify(extra) : "");
          };

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
            jobType: "video_generation",
            payload: {
              prompt: input.prompt,
              model: input.model,
              ...(input.duration != null ? { duration: input.duration } : {}),
              ...(input.resolution ? { resolution: input.resolution } : {}),
              ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
              ...(input.inputImages ? { input_images: input.inputImages } : {}),
              ...(input.inputVideo ? { input_video: input.inputVideo } : {}),
              ...(input.enableAudio != null ? { enable_audio: input.enableAudio } : {}),
            },
          });
          jobLap("job_created", { jobId: job.id });

          // Poll until terminal state — video generation is slower
          const POLL_INTERVAL = 3000;
          const MAX_WAIT = 300_000; // 5 minutes
          const start = Date.now();
          let pollCount = 0;

          while (Date.now() - start < MAX_WAIT) {
            await delay(POLL_INTERVAL);
            pollCount++;

            if (run.controller.signal.aborted) {
              throw new Error("Run was canceled");
            }

            const current = await jobSvc.getJobAdmin(job.id);

            if (current.status === "succeeded" && current.result) {
              const result = current.result as {
                signed_url?: string;
                duration_seconds?: number;
                width?: number;
                height?: number;
                mime_type?: string;
              };
              jobLap("job_poll_done", { pollCount, status: "succeeded" });
              return {
                jobId: job.id,
                videoUrl: result.signed_url ?? "",
                durationSeconds: result.duration_seconds,
                width: result.width,
                height: result.height,
                mimeType: result.mime_type ?? "video/mp4",
              };
            }

            if (current.status === "dead_letter" || current.status === "canceled") {
              jobLap("job_poll_done", { pollCount, status: current.status });
              return {
                jobId: job.id,
                error: current.error_message ?? `Job ${current.status}`,
              };
            }

            if (
              current.status === "failed" &&
              current.attempt_count >= current.max_attempts
            ) {
              jobLap("job_poll_done", { pollCount, status: "failed_max_retries" });
              return {
                jobId: job.id,
                error: current.error_message ?? "Job failed after max retries",
              };
            }
          }

          jobLap("job_poll_done", { pollCount, status: "timeout" });
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

        // Resolve brand kit ID from canvas → project in a single joined query
        let brandKitId: string | null = null;
        if (run.canvasId && run.accessToken && options.createUserClient) {
          try {
            const client = options.createUserClient(run.accessToken) as any;
            const { data: canvas } = await client
              .from("canvases")
              .select("project_id, projects!inner(brand_kit_id)")
              .eq("id", run.canvasId)
              .maybeSingle();
            brandKitId = canvas?.projects?.brand_kit_id ?? null;
          } catch (err) {
            // Fallback: joined query may fail if FK isn't exposed via PostgREST
            // In that case, try the two-step approach
            try {
              const client = options.createUserClient(run.accessToken) as any;
              const { data: c } = await client
                .from("canvases")
                .select("project_id")
                .eq("id", run.canvasId)
                .maybeSingle();
              if (c?.project_id) {
                const { data: p } = await client
                  .from("projects")
                  .select("brand_kit_id")
                  .eq("id", c.project_id)
                  .maybeSingle();
                brandKitId = p?.brand_kit_id ?? null;
              }
            } catch (err2) {
              console.warn("Failed to resolve brand kit ID:", err2);
            }
          }
        }

        rlog.lap("brand_kit_resolved");

        agent = resolvedAgentFactory({
          ...(brandKitId ? { brandKitId } : {}),
          ...(run.canvasId ? { canvasId: run.canvasId } : {}),
          ...(persistence ? { checkpointer: persistence.checkpointer } : {}),
          ...(options.connectionManager ? { connectionManager: options.connectionManager } : {}),
          env: options.env,
          ...(resolvedModel ? { model: resolvedModel } : {}),
          ...(persistImage ? { persistImage } : {}),
          ...(submitImageJob ? { submitImageJob } : {}),
          ...(submitVideoJob ? { submitVideoJob } : {}),
          ...(persistence ? { store: persistence.store } : {}),
        });
        rlog.lap("agent_factory_done");
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
        let userMessage: HumanMessage;
        let attachmentDataMap: Record<string, string> = {};

        if (hasAttachments) {
          // Download images and build parallel data structures:
          // 1. imageBlocks: base64 content parts for LLM vision
          // 2. downloaded: assetId → base64 mapping for tool resolution
          const downloaded: Array<{ assetId: string; mimeType: string; base64: string }> = [];
          const imageBlocks = await Promise.all(
            run.attachments!.map(async (a) => {
              try {
                let b64: string;
                let mime: string;

                // Handle data URIs directly (canvas-ref images) — no fetch needed
                const dataUriMatch = a.url.match(/^data:([^;]+);base64,(.+)$/);
                if (dataUriMatch) {
                  mime = dataUriMatch[1]!;
                  b64 = dataUriMatch[2]!;
                } else {
                  const res = await fetch(a.url);
                  const buf = Buffer.from(await res.arrayBuffer());
                  mime = a.mimeType || res.headers.get("content-type") || "image/png";
                  b64 = buf.toString("base64");
                }

                downloaded.push({ assetId: a.assetId, mimeType: mime, base64: b64 });
                return {
                  type: "image" as const,
                  source_type: "base64" as const,
                  data: b64,
                  mime_type: mime,
                };
              } catch {
                return {
                  type: "image" as const,
                  source_type: "url" as const,
                  url: a.url,
                  mimeType: a.mimeType,
                };
              }
            }),
          );

          // Build XML text tags for LLM to reference by assetId
          const { text: enrichedPrompt } = buildUserMessage(
            run.prompt,
            run.attachments!,
            run.imageGenerationPreference,
            run.mentions,
          );

          // Build assetId → data URI map for tool-level resolution
          attachmentDataMap = buildAttachmentDataMap(downloaded);

          userMessage = new HumanMessage({
            content: [
              { type: "text" as const, text: enrichedPrompt },
              ...imageBlocks,
            ],
          });
        } else {
          const { text: enrichedPrompt } = buildUserMessage(
            run.prompt,
            [],
            run.imageGenerationPreference,
            run.mentions,
          );
          userMessage = new HumanMessage(enrichedPrompt);
        }

        rlog.lap("stream_call_start");
        stream = agent.streamEvents(
          {
            messages: [userMessage],
          },
          {
            ...(run.threadId || run.canvasId || run.accessToken || run.userId || Object.keys(attachmentDataMap).length > 0
              ? {
                  configurable: {
                    ...(run.threadId ? { thread_id: run.threadId } : {}),
                    ...(run.canvasId ? { canvas_id: run.canvasId } : {}),
                    ...(run.accessToken ? { access_token: run.accessToken } : {}),
                    ...(run.userId ? { user_id: run.userId } : {}),
                    ...(Object.keys(attachmentDataMap).length > 0
                      ? { user_attachment_map: attachmentDataMap }
                      : {}),
                  },
                }
              : {}),
            signal: run.controller.signal,
            version: "v2",
          },
        );
        rlog.lap("stream_call_returned");
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
