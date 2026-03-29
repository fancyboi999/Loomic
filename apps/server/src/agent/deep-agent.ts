import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph-checkpoint";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { ChatOpenAI } from "@langchain/openai";
import type { BackendFactory } from "deepagents";
import { createDeepAgent } from "deepagents";

import type { ServerEnv } from "../config/env.js";
import type { ConnectionManager } from "../ws/connection-manager.js";
import { createAgentBackendFactory } from "./backends/index.js";
import { LOOMIC_SYSTEM_PROMPT } from "./prompts/loomic-main.js";
import { createImageSubAgent, createVideoSubAgent } from "./sub-agents.js";
import { createMainAgentTools } from "./tools/index.js";
import type { PersistImageFn, SubmitImageJobFn } from "./tools/image-generate.js";

export type LoomicAgent = Pick<
  ReturnType<typeof createDeepAgent>,
  "stream" | "streamEvents"
>;

export type LoomicAgentFactory = (options: {
  brandKitId?: string | null;
  canvasId?: string;
  checkpointer?: BaseCheckpointSaver;
  connectionManager?: ConnectionManager;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
  persistImage?: PersistImageFn;
  submitImageJob?: SubmitImageJobFn;
  store?: BaseStore;
}) => LoomicAgent;

export function createLoomicDeepAgent(options: {
  backendFactory?: BackendFactory;
  brandKitId?: string | null;
  canvasId?: string;
  checkpointer?: BaseCheckpointSaver;
  connectionManager?: ConnectionManager;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
  persistImage?: PersistImageFn;
  submitImageJob?: SubmitImageJobFn;
  store?: BaseStore;
}): LoomicAgent {
  const backendFactory =
    options.backendFactory ??
    createAgentBackendFactory(options.env, options.canvasId);

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
    backend: backendFactory,
    ...(options.checkpointer ? { checkpointer: options.checkpointer } : {}),
    model: resolvedModel,
    name: "loomic",
    ...(options.store ? { store: options.store } : {}),
    subagents: [
      createImageSubAgent({
        ...(options.persistImage ? { persistImage: options.persistImage } : {}),
        ...(options.submitImageJob ? { submitImageJob: options.submitImageJob } : {}),
      }),
      createVideoSubAgent(),
    ],
    systemPrompt,
    tools: createMainAgentTools(backendFactory, {
      createUserClient,
      ...(options.brandKitId != null ? { brandKitId: options.brandKitId } : {}),
      ...(options.connectionManager ? { connectionManager: options.connectionManager } : {}),
      ...(options.persistImage ? { persistImage: options.persistImage } : {}),
      ...(options.submitImageJob ? { submitImageJob: options.submitImageJob } : {}),
    }),
  });
}

/**
 * Create a streaming ChatOpenAI model.
 *
 * `streamUsage` is disabled because the one-api proxy mishandles
 * `stream_options: { include_usage: true }` — it strips `delta.role`
 * from streaming chunks, causing LangChain to create ChatMessageChunk
 * (type "generic") instead of AIMessageChunk (type "ai"), which breaks
 * deepagents middleware validation and loses tool_calls entirely.
 */
function createStreamingChatModel(specifier: string): ChatOpenAI {
  const modelName = specifier.startsWith("openai:")
    ? specifier.slice("openai:".length)
    : specifier;

  return new ChatOpenAI({
    model: modelName,
    streaming: true,
    streamUsage: false,
  });
}

export function createDefaultModelSpecifier(
  env: Pick<ServerEnv, "agentModel">,
) {
  return `openai:${env.agentModel}`;
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
