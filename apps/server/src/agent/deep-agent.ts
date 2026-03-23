import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import type { BackendFactory } from "deepagents";
import { createDeepAgent } from "deepagents";

import type { ServerEnv } from "../config/env.js";
import { createAgentBackendFactory } from "./backends/index.js";
import { createPhaseATools } from "./tools/index.js";

export type LoomicAgent = Pick<ReturnType<typeof createDeepAgent>, "stream">;

export type LoomicAgentFactory = (options: {
  env: ServerEnv;
  model?: BaseLanguageModel | string;
}) => LoomicAgent;

const DEFAULT_SYSTEM_PROMPT =
  "You are Loomic's Phase A workspace agent. Use project_search when the user asks to inspect workspace content. Keep responses concise and factual.";

export function createLoomicDeepAgent(options: {
  backendFactory?: BackendFactory;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
}): LoomicAgent {
  const backendFactory =
    options.backendFactory ?? createAgentBackendFactory(options.env);

  if (!options.model) {
    applyOpenAICompatEnv(options.env);
  }

  return createDeepAgent({
    backend: backendFactory,
    model: options.model ?? createDefaultModelSpecifier(options.env),
    name: "loomic-phase-a",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    tools: createPhaseATools(backendFactory),
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
