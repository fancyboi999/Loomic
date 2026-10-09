import { Agent, type AgentEvent, type AgentMessage, type AgentTool, type StreamFn } from "@earendil-works/pi-agent-core";
import { randomUUID } from "node:crypto";
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  normalizeContext,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { googleVertexProvider } from "@earendil-works/pi-ai/providers/google-vertex";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { Type } from "typebox";

import { DEFAULT_AGENT_MODEL, DEFAULT_GOOGLE_AGENT_MODEL, type ServerEnv } from "../config/env.js";
import type { ConnectionManager } from "../ws/connection-manager.js";
import { createAgentTrace } from "../observability/langfuse.js";
import { createAgentBackend, type AgentBackendResult } from "./backends/index.js";
import type { AgentWorkspace } from "./backends/types.js";
import { createContextCompactor } from "./context-compaction.js";
import { LOOMIC_SYSTEM_PROMPT } from "./prompts/loomic-main.js";
import type { AgentPersistence } from "./persistence/index.js";
import { createMainAgentTools } from "./tools/index.js";
import type { PersistImageFn, SubmitImageJobFn } from "./tools/image-generate.js";
import type { SubmitVideoJobFn } from "./tools/video-generate.js";
import type { WorkspaceSkillEntry } from "./workspace-skills.js";

export type PiRunContext = {
  accessToken?: string;
  attachmentMap?: Record<string, string>;
  canvasId?: string;
  imageModelIds?: string[];
  runId?: string;
  sessionId?: string;
  videoModelIds?: string[];
  threadId?: string;
  userId?: string;
};

export type LoomicAgent = {
  stream(message: AgentMessage, context: PiRunContext, signal: AbortSignal): AsyncIterable<AgentEvent>;
};

export type LoomicAgentFactory = (options: {
  backendResult?: AgentBackendResult;
  brandKitId?: string | null;
  canvasId?: string;
  connectionManager?: ConnectionManager;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  model?: Model<any> | string;
  persistImage?: PersistImageFn;
  persistence?: AgentPersistence;
  submitImageJob?: SubmitImageJobFn;
  submitVideoJob?: SubmitVideoJobFn;
  streamFn?: StreamFn;
  workspaceSkills?: WorkspaceSkillEntry[];
}) => LoomicAgent;

/** Pi owns the model loop, tool calls, and transcript. */
export function createLoomicPiAgent(options: Parameters<LoomicAgentFactory>[0]): LoomicAgent {
  const backendResult = options.backendResult ?? createAgentBackend(options.env, options.canvasId, {
    ...(options.persistence ? { fileStore: options.persistence.fileStore } : {}),
  });
  const backend = backendResult.workspace;
  const model = typeof options.model === "object" && options.model !== null
    ? options.model
    : resolveModel(options.model ?? createDefaultModelSpecifier(options.env), options.env);
  const models = createModels();
  models.setProvider(openaiProvider());
  models.setProvider(googleProvider());
  models.setProvider(googleVertexProvider());
  if (model.provider === "openai-compat") {
    models.setProvider(createProvider({
      id: "openai-compat",
      auth: { apiKey: envApiKeyAuth("OpenAI API key", ["OPENAI_API_KEY"]) },
      models: [model],
      api: model.api === "openai-responses" ? openAIResponsesApi() : openAICompletionsApi(),
    }));
  }

  const createUserClient = options.createUserClient ?? (() => {
    throw new Error("A user client is required for canvas tools.");
  });
  return {
    async *stream(message, context, signal) {
      const streamFn = options.streamFn ?? models.streamSimple.bind(models);
      const tools = createMainAgentTools(backend, {
        createUserClient,
        ...(options.brandKitId ? { brandKitId: options.brandKitId } : {}),
        ...(options.connectionManager ? { connectionManager: options.connectionManager } : {}),
        ...(options.persistImage ? { persistImage: options.persistImage } : {}),
        sandboxDir: backendResult.sandboxDir,
        ...(options.submitImageJob ? { submitImageJob: options.submitImageJob } : {}),
        ...(options.submitVideoJob ? { submitVideoJob: options.submitVideoJob } : {}),
        translateVideoPrompt: async (prompt) => {
          const translation = await streamFn(model, normalizeContext({
            messages: [{
              role: "user",
              content: `Translate this video scene prompt into English for Veo. Preserve every subject, count, color, action, background, camera, lighting, and exclusion. Return only the English prompt.\n\n${prompt}`,
              timestamp: Date.now(),
            }],
          }), {
            maxTokens: 512,
            ...(model.reasoning ? { reasoning: "low" } : {}),
            signal,
          });
          const response = await translation.result();
          if (response.stopReason === "error" || response.stopReason === "aborted") {
            throw new Error(response.errorMessage ?? "Video prompt translation failed.");
          }
          const englishPrompt = response.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("")
            .trim();
          if (!englishPrompt || /[\u3400-\u9fff]/u.test(englishPrompt)) {
            throw new Error("Video prompt translation did not produce English text.");
          }
          return englishPrompt;
        },
        ...(context.imageModelIds ? { imageModelIds: context.imageModelIds } : {}),
        ...(context.videoModelIds ? { videoModelIds: context.videoModelIds } : {}),
      }, {
        ...(context.accessToken ? { access_token: context.accessToken } : {}),
        ...(context.canvasId ? { canvas_id: context.canvasId } : {}),
        ...(context.userId ? { user_id: context.userId } : {}),
        ...(context.attachmentMap ? { user_attachment_map: context.attachmentMap } : {}),
      });
      const previousMessages = context.threadId
        ? await options.persistence?.loadMessages(context.threadId) ?? []
        : [];
      const compactContext = createContextCompactor(model.contextWindow, async (prompt, abortSignal) => {
        const summaryStream = await streamFn(model, normalizeContext({
          messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
        }), {
          maxTokens: 2048,
          ...(model.reasoning ? { reasoning: "low" } : {}),
          ...(abortSignal ? { signal: abortSignal } : {}),
        });
        const response = await summaryStream.result();
        if (response.stopReason === "error" || response.stopReason === "aborted") {
          throw new Error(response.errorMessage ?? "Context summarization failed.");
        }
        return response.content.filter((part) => part.type === "text").map((part) => part.text).join("");
      });
      const trace = createAgentTrace(options.env, {
        runId: context.runId ?? randomUUID(),
        sessionId: context.sessionId ?? context.threadId ?? "unknown",
        ...(context.canvasId ? { canvasId: context.canvasId } : {}),
        ...(context.threadId ? { threadId: context.threadId } : {}),
        ...(context.userId ? { userId: context.userId } : {}),
        modelId: model.id,
        input: typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text").map((part) => part.text).join(""),
      });
      const tracedStreamFn: StreamFn = (requestModel, requestContext, requestOptions) => {
        trace.recordModelRequest(requestContext);
        return streamFn(requestModel, requestContext, requestOptions);
      };
      const agent = new Agent({
        initialState: {
          systemPrompt: buildSystemPrompt(options.brandKitId, options.workspaceSkills),
          model,
          thinkingLevel: model.reasoning ? "medium" : "off",
          messages: previousMessages,
          tools: [
            ...createFileTools(backend),
            createTodoTool(),
            ...tools,
          ],
        },
        streamFn: tracedStreamFn,
        transformContext: compactContext,
        toolExecution: "sequential",
        ...(model.reasoning && (model.provider === "google" || model.provider === "google-vertex") && model.id.includes("2.5")
          ? { thinkingBudgets: { medium: -1 } }
          : {}),
      });
      const events: AgentEvent[] = [];
      let wake: (() => void) | undefined;
      let settled = false;
      let failure: unknown;
      agent.subscribe((event) => {
        trace.record(event);
        events.push(event);
        wake?.();
      });
      const onAbort = () => agent.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        signal.removeEventListener("abort", onAbort);
        return;
      }
      const task = agent.prompt(message).catch((error) => {
        failure = error;
      }).finally(() => {
        settled = true;
        wake?.();
      });
      try {
        while (!settled || events.length > 0) {
          if (events.length > 0) {
            yield events.shift()!;
          } else {
            await new Promise<void>((resolve) => { wake = resolve; });
            wake = undefined;
          }
        }
        await task;
        if (failure) throw failure;
        if (context.threadId) {
          await options.persistence?.saveMessages(context.threadId, agent.state.messages);
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
        if (!settled) {
          agent.abort();
          await task;
        }
        await trace.finish(signal.aborted ? "canceled" : failure ? "failed" : "completed");
      }
    },
  };
}

function createFileTools(backend: AgentWorkspace): AgentTool[] {
  function fileTool<T extends Record<string, unknown>>(
    name: string,
    description: string,
    parameters: AgentTool["parameters"],
    run: (params: T) => Promise<unknown>,
  ): AgentTool {
    return {
      name, label: name, description, parameters,
      async execute(id, params) {
        const output = await run(params as T);
        let text = typeof output === "string" ? output : JSON.stringify(output);
        if (text.length > 80_000) {
          const path = `/tool-results/${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`;
          const saved = await backend.write(path, text);
          text = `Result was too large. Read the full result from ${path}. ${JSON.stringify(saved)}`;
        }
        return { content: [{ type: "text", text }], details: undefined };
      },
    };
  }
  const tools: AgentTool[] = [
    fileTool("ls", "List files and directories", Type.Object({ path: Type.Optional(Type.String()) }), (p) => Promise.resolve(backend.lsInfo((p.path as string | undefined) ?? "/"))),
    fileTool("read_file", "Read a file with line numbers", Type.Object({ file_path: Type.String(), offset: Type.Optional(Type.Number()), limit: Type.Optional(Type.Number()) }), (p) => Promise.resolve(backend.read(p.file_path as string, p.offset as number | undefined, p.limit as number | undefined))),
    fileTool("write_file", "Create a file", Type.Object({ file_path: Type.String(), content: Type.Optional(Type.String()) }), (p) => Promise.resolve(backend.write(p.file_path as string, (p.content as string | undefined) ?? ""))),
    fileTool("edit_file", "Replace text in a file", Type.Object({ file_path: Type.String(), old_string: Type.String(), new_string: Type.String(), replace_all: Type.Optional(Type.Boolean()) }), (p) => Promise.resolve(backend.edit(p.file_path as string, p.old_string as string, p.new_string as string, p.replace_all as boolean | undefined))),
    fileTool("glob", "Find files by glob pattern", Type.Object({ pattern: Type.String(), path: Type.Optional(Type.String()) }), (p) => Promise.resolve(backend.globInfo(p.pattern as string, p.path as string | undefined))),
    fileTool("grep", "Search file contents", Type.Object({ pattern: Type.String(), path: Type.Optional(Type.String()), glob: Type.Optional(Type.String()) }), (p) => Promise.resolve(backend.grepRaw(p.pattern as string, p.path as string | undefined, p.glob as string | undefined))),
  ];
  tools.push(fileTool("execute", "Run a shell command in the isolated sandbox", Type.Object({ command: Type.String() }), (p) => backend.execute(p.command as string)));
  return tools;
}

function createTodoTool(): AgentTool {
  const todos: Array<{ content: string; status: "pending" | "in_progress" | "completed" }> = [];
  return {
    name: "write_todos",
    label: "Task list",
    description: "Replace the current task list with the latest status of each step.",
    parameters: Type.Object({
      todos: Type.Array(Type.Object({
        content: Type.String(),
        status: Type.Union([Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("completed")]),
      })),
    }),
    async execute(_id, params) {
      const input = params as { todos: typeof todos };
      todos.splice(0, todos.length, ...input.todos);
      return { content: [{ type: "text", text: JSON.stringify({ todos }) }], details: undefined };
    },
  };
}

function buildSystemPrompt(brandKitId?: string | null, skills: WorkspaceSkillEntry[] = []): string {
  let prompt = LOOMIC_SYSTEM_PROMPT;
  if (brandKitId) prompt += "\n\n当前项目已绑定品牌套件。在进行设计相关工作时，请先使用 get_brand_kit 工具查询品牌信息，确保设计符合品牌规范。";
  if (skills.length > 0) {
    prompt += `\n\n## Skills\n\nThe following skills are enabled in this workspace:\n${skills.map((skill) => {
      const counts: Record<string, number> = {};
      for (const file of skill.files) {
        const dir = file.path.split("/")[0] ?? "other";
        counts[dir] = (counts[dir] ?? 0) + 1;
      }
      const summary = Object.entries(counts).map(([dir, count]) => `${dir}/ (${count})`).join(", ");
      return `- **${skill.name}**: ${skill.description}\n  → Read \`${skill.path}\` for full instructions${summary ? `\n  → Has: ${summary}` : ""}`;
    }).join("\n")}`;
  }
  return prompt;
}

export function createDefaultModelSpecifier(env: Pick<ServerEnv, "agentModel">): string {
  const model = env.agentModel;
  if (model.includes(":")) return model;
  return model.startsWith("gemini-") ? `google:${model}` : `openai:${model}`;
}

function resolveModel(specifier: string, env: ServerEnv): Model<any> {
  const colon = specifier.indexOf(":");
  let provider = colon > 0 ? specifier.slice(0, colon) : "openai";
  let modelId = colon > 0 ? specifier.slice(colon + 1) : specifier;
  const googleApiKey = env.googleApiKey ?? process.env.GOOGLE_API_KEY;
  const vertexProject = env.googleVertexProject ?? process.env.GOOGLE_VERTEX_PROJECT;
  const vertexLocation = env.googleVertexLocation ?? process.env.GOOGLE_VERTEX_LOCATION;
  const hasGoogle = !!(googleApiKey || (vertexProject && vertexLocation));
  if (provider === "google" && !hasGoogle) { provider = "openai"; modelId = DEFAULT_AGENT_MODEL; }
  if (provider === "openai" && !env.openAIApiKey && !process.env.OPENAI_API_KEY && hasGoogle) { provider = "google"; modelId = DEFAULT_GOOGLE_AGENT_MODEL; }

  if (env.openAIApiKey) process.env.OPENAI_API_KEY = env.openAIApiKey;
  if (googleApiKey) process.env.GEMINI_API_KEY = googleApiKey;
  if (vertexProject) process.env.GOOGLE_CLOUD_PROJECT = vertexProject;
  if (vertexLocation) process.env.GOOGLE_CLOUD_LOCATION = vertexLocation;
  if (env.googleApplicationCredentials) process.env.GOOGLE_APPLICATION_CREDENTIALS = env.googleApplicationCredentials;

  const models = createModels();
  models.setProvider(openaiProvider());
  models.setProvider(googleProvider());
  models.setProvider(googleVertexProvider());
  if (provider === "google" && vertexProject && vertexLocation) provider = "google-vertex";
  const existing = models.getModel(provider, modelId);
  if (existing && !(env.openAIApiBase && provider === "openai")) return existing;
  const template = existing ?? models.getModel(provider, provider === "openai" ? "gpt-4o" : "gemini-2.5-flash") ?? models.getModels(provider)[0];
  if (!template) throw new Error(`Unsupported agent model provider: ${provider}`);
  if (provider !== "openai") return { ...template, id: modelId, name: modelId };
  const useResponses = modelId.startsWith("gpt-6-") || modelId.startsWith("gpt-6.");
  return {
    ...template,
    id: modelId,
    name: modelId,
    api: useResponses ? "openai-responses" : "openai-completions",
    provider: "openai-compat",
    baseUrl: env.openAIApiBase ?? "https://api.openai.com/v1",
    reasoning: modelId.startsWith("gpt-5") || modelId.startsWith("gpt-6"),
    input: ["text", "image"],
  };
}
