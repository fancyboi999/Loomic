import type { FastifyInstance } from "fastify";

import { type ModelInfo, modelListResponseSchema } from "@loomic/shared";

const AVAILABLE_MODELS: ModelInfo[] = [
  { id: "wanjie/claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "openai" },
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  { id: "o3-mini", name: "o3 Mini", provider: "openai" },
];

export async function registerModelRoutes(app: FastifyInstance) {
  app.get("/api/models", async (_request, reply) => {
    return reply
      .code(200)
      .send(modelListResponseSchema.parse({ models: AVAILABLE_MODELS }));
  });
}
