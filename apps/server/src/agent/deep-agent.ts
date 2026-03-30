import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph-checkpoint";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent } from "deepagents";

import type { ServerEnv } from "../config/env.js";
import type { ConnectionManager } from "../ws/connection-manager.js";
import { createAgentBackend, type AgentBackendResult } from "./backends/index.js";
import { LOOMIC_SYSTEM_PROMPT } from "./prompts/loomic-main.js";
import { createVideoSubAgent } from "./sub-agents.js";
import { createMainAgentTools } from "./tools/index.js";
import type { PersistImageFn, SubmitImageJobFn } from "./tools/image-generate.js";
import type { SubmitVideoJobFn } from "./tools/video-generate.js";

export type LoomicAgent = Pick<
  ReturnType<typeof createDeepAgent>,
  "stream" | "streamEvents"
>;

export type LoomicAgentFactory = (options: {
  backendResult?: AgentBackendResult;
  brandKitId?: string | null;
  canvasId?: string;
  checkpointer?: BaseCheckpointSaver;
  connectionManager?: ConnectionManager;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
  persistImage?: PersistImageFn;
  submitImageJob?: SubmitImageJobFn;
  submitVideoJob?: SubmitVideoJobFn;
  store?: BaseStore;
}) => LoomicAgent;

export function createLoomicDeepAgent(options: {
  backendResult?: AgentBackendResult;
  brandKitId?: string | null;
  canvasId?: string;
  checkpointer?: BaseCheckpointSaver;
  connectionManager?: ConnectionManager;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
  persistImage?: PersistImageFn;
  submitImageJob?: SubmitImageJobFn;
  submitVideoJob?: SubmitVideoJobFn;
  store?: BaseStore;
}): LoomicAgent {
  const backendResult =
    options.backendResult ?? createAgentBackend(options.env, options.canvasId);

  applyOpenAICompatEnv(options.env);

  const modelSpec = options.model ?? createDefaultModelSpecifier(options.env);
  const resolvedModel =
    typeof modelSpec === "string"
      ? createStreamingChatModel(modelSpec)
      : modelSpec;

  const createUserClient =
    options.createUserClient ??
    ((_accessToken: string): never => {
      throw new Error(
        "inspect_canvas is unavailable: no createUserClient was provided to createLoomicDeepAgent.",
      );
    });

  const systemPrompt = options.brandKitId
    ? LOOMIC_SYSTEM_PROMPT +
      "\n\n当前项目已绑定品牌套件。在进行设计相关工作时，请先使用 get_brand_kit 工具查询品牌信息，确保设计符合品牌规范。"
    : LOOMIC_SYSTEM_PROMPT;

  return createDeepAgent({
    backend: backendResult.factory,
    ...(options.checkpointer ? { checkpointer: options.checkpointer } : {}),
    model: resolvedModel,
    name: "loomic",
    skills: ["/skills/"],
    ...(options.store ? { store: options.store } : {}),
    subagents: [createVideoSubAgent()],
    systemPrompt,
    tools: createMainAgentTools(backendResult.factory, {
      createUserClient,
      ...(options.brandKitId != null ? { brandKitId: options.brandKitId } : {}),
      ...(options.connectionManager ? { connectionManager: options.connectionManager } : {}),
      ...(options.persistImage ? { persistImage: options.persistImage } : {}),
      ...(backendResult.sandboxDir ? { sandboxDir: backendResult.sandboxDir } : {}),
      ...(options.submitImageJob ? { submitImageJob: options.submitImageJob } : {}),
      ...(options.submitVideoJob ? { submitVideoJob: options.submitVideoJob } : {}),
    }),
  });
}

/**
 * Create a streaming chat model from a `<provider>:<model-id>` specifier.
 *
 * Supported providers:
 * - `openai` (default) — uses ChatOpenAI with `streamUsage: false` to work
 *   around the one-api proxy stripping `delta.role` from chunks.
 * - `google` — uses ChatGoogleGenerativeAI (Google AI Studio, direct connection).
 */
function createStreamingChatModel(specifier: string): BaseLanguageModel {
  const colonIdx = specifier.indexOf(":");
  const provider = colonIdx > 0 ? specifier.slice(0, colonIdx) : "openai";
  const modelName = colonIdx > 0 ? specifier.slice(colonIdx + 1) : specifier;

  switch (provider) {
    case "google":
      return new ChatGoogleGenerativeAI({
        model: modelName,
        apiKey: process.env.GOOGLE_API_KEY,
        streaming: true,
      });
    case "openai":
    default:
      return new ChatOpenAI({
        model: modelName,
        streaming: true,
        streamUsage: false,
      });
  }
}

/** Known model-name prefixes that map to Google Gemini. */
const GOOGLE_MODEL_PREFIXES = ["gemini-"];

export function createDefaultModelSpecifier(
  env: Pick<ServerEnv, "agentModel">,
) {
  const model = env.agentModel;
  // Already has an explicit provider prefix — pass through as-is.
  if (model.includes(":")) return model;
  // Auto-detect Google models by name prefix.
  if (GOOGLE_MODEL_PREFIXES.some((p) => model.startsWith(p)))
    return `google:${model}`;
  return `openai:${model}`;
}

export function applyOpenAICompatEnv(
  env: Pick<ServerEnv, "openAIApiBase" | "openAIApiKey">,
  target: NodeJS.ProcessEnv = process.env,
) {
  if (env.openAIApiKey) {
    target.OPENAI_API_KEY = env.openAIApiKey;
  }

  if (env.openAIApiBase) {
    target.OPENAI_BASE_URL = env.openAIApiBase;
  }
}
