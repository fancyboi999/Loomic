import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph-checkpoint";

import type { ServerEnv } from "../../config/env.js";
import { createSupabaseCheckpointer } from "./supabase-checkpointer.js";
import { createSupabaseStore } from "./supabase-store.js";

export type AgentPersistence = {
  checkpointer: BaseCheckpointSaver;
  store: BaseStore;
};

export type AgentPersistenceService = {
  getPersistence(): Promise<AgentPersistence | null>;
};

export function createAgentPersistenceService(
  env: Pick<ServerEnv, "supabaseDbUrl">,
  overrides?: {
    createCheckpointer?: typeof createSupabaseCheckpointer;
    createStore?: typeof createSupabaseStore;
  },
): AgentPersistenceService {
  let pendingPersistence: Promise<AgentPersistence> | null = null;

  return {
    async getPersistence() {
      if (!env.supabaseDbUrl) {
        return null;
      }

      if (!pendingPersistence) {
        pendingPersistence = Promise.all([
          (overrides?.createCheckpointer ?? createSupabaseCheckpointer)({
            connectionString: env.supabaseDbUrl,
          }),
          (overrides?.createStore ?? createSupabaseStore)({
            connectionString: env.supabaseDbUrl,
          }),
        ])
          .then(([checkpointer, store]) => ({ checkpointer, store }))
          .catch((error) => {
            pendingPersistence = null;
            throw error;
          });
      }

      return pendingPersistence;
    },
  };
}
