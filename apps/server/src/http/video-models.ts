import type { FastifyInstance } from "fastify";
import { getAvailableVideoModels } from "../generation/providers/registry.js";

export async function registerVideoModelRoutes(app: FastifyInstance) {
  app.get("/api/video-models", async (_request, reply) => {
    const models = getAvailableVideoModels();
    return reply.code(200).send({ models });
  });
}
