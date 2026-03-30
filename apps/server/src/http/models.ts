import type { FastifyInstance } from "fastify";

import { type ModelInfo, modelListResponseSchema } from "@loomic/shared";
import type { ServerEnv } from "../config/env.js";

const OPENAI_MODELS: ModelInfo[] = [
  { id: "openai:az_sre/gpt-5.4", name: "GPT-5.4", provider: "openai" },
  { id: "openai:gpt-5.4", name: "OpenAI GPT-5.4", provider: "openai" },
  { id: "openai:gpt-5.2", name: "OpenAI GPT-5.2", provider: "openai" },
  { id: "openai:gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "openai" },
  { id: "openai:gpt-4.1", name: "GPT-4.1", provider: "openai" },
  { id: "openai:gpt-4o", name: "GPT-4o", provider: "openai" },
  { id: "openai:gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  { id: "openai:o3-mini", name: "o3 Mini", provider: "openai" },
];

const GOOGLE_MODELS: ModelInfo[] = [
  { id: "google:gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
  { id: "google:gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
  { id: "google:gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "google" },
];

export async function registerModelRoutes(app: FastifyInstance, env: ServerEnv) {
  app.get("/api/models", async (_request, reply) => {
    const models: ModelInfo[] = [];
    if (env.openAIApiKey) models.push(...OPENAI_MODELS);
    if (env.googleApiKey) models.push(...GOOGLE_MODELS);
    return reply.code(200).send(modelListResponseSchema.parse({ models }));
  });
}
