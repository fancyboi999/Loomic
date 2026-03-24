import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph-checkpoint";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { ChatOpenAI } from "@langchain/openai";
import type { BackendFactory } from "deepagents";
import { createDeepAgent } from "deepagents";

import type { ServerEnv } from "../config/env.js";
import { createAgentBackendFactory } from "./backends/index.js";
import { LOOMIC_SYSTEM_PROMPT } from "./prompts/loomic-main.js";
import { createImageSubAgent, createVideoSubAgent } from "./sub-agents.js";
import { createMainAgentTools } from "./tools/index.js";

export type LoomicAgent = Pick<
  ReturnType<typeof createDeepAgent>,
  "stream" | "streamEvents"
>;

export type LoomicAgentFactory = (options: {
  canvasId?: string;
  checkpointer?: BaseCheckpointSaver;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
  store?: BaseStore;
}) => LoomicAgent;

export function createLoomicDeepAgent(options: {
  backendFactory?: BackendFactory;
  canvasId?: string;
  checkpointer?: BaseCheckpointSaver;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
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

  return createDeepAgent({
    backend: backendFactory,
    ...(options.checkpointer ? { checkpointer: options.checkpointer } : {}),
    model: resolvedModel,
    name: "loomic",
    ...(options.store ? { store: options.store } : {}),
    subagents: [createImageSubAgent(), createVideoSubAgent()],
    systemPrompt: LOOMIC_SYSTEM_PROMPT,
    tools: createMainAgentTools(backendFactory, { createUserClient }),
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
