import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph-checkpoint";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { ChatOpenAI } from "@langchain/openai";
import type { BackendFactory } from "deepagents";
import { createDeepAgent } from "deepagents";

import type { ServerEnv } from "../config/env.js";
import { createAgentBackendFactory } from "./backends/index.js";
import { createPhaseATools } from "./tools/index.js";

export type LoomicAgent = Pick<
  ReturnType<typeof createDeepAgent>,
  "stream" | "streamEvents"
>;

export type LoomicAgentFactory = (options: {
  checkpointer?: BaseCheckpointSaver;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
  store?: BaseStore;
}) => LoomicAgent;

const DEFAULT_SYSTEM_PROMPT =
  "You are Loomic's Phase A workspace agent. Use project_search when the user asks to inspect workspace content. Keep responses concise and factual.";

export function createLoomicDeepAgent(options: {
  backendFactory?: BackendFactory;
  checkpointer?: BaseCheckpointSaver;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
  store?: BaseStore;
}): LoomicAgent {
  const backendFactory =
    options.backendFactory ?? createAgentBackendFactory(options.env);

  applyOpenAICompatEnv(options.env);

  const modelSpec = options.model ?? createDefaultModelSpecifier(options.env);
  const resolvedModel =
    typeof modelSpec === "string"
      ? createStreamingChatModel(modelSpec)
      : modelSpec;

  return createDeepAgent({
    backend: backendFactory,
    ...(options.checkpointer ? { checkpointer: options.checkpointer } : {}),
    model: resolvedModel,
    name: "loomic-phase-a",
    ...(options.store ? { store: options.store } : {}),
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    tools: createPhaseATools(backendFactory),
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
