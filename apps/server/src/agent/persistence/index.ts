import type { AgentMessage } from "@earendil-works/pi-agent-core";

import type { ServerEnv } from "../../config/env.js";
import { createPiSessionStore } from "./pi-session-store.js";

export type AgentPersistence = {
  fileStore: ReturnType<typeof createPiSessionStore>["fileStore"];
  loadMessages(threadId: string): Promise<AgentMessage[]>;
  saveMessages(threadId: string, messages: AgentMessage[]): Promise<void>;
};

export type AgentPersistenceService = {
  getPersistence(): Promise<AgentPersistence | null>;
};

export function createAgentPersistenceService(
  env: Pick<ServerEnv, "supabaseDbUrl">,
  overrides?: {
    createPiSessionStore?: typeof createPiSessionStore;
  },
): AgentPersistenceService {
  let persistence: AgentPersistence | null = null;

  return {
    async getPersistence() {
      if (!env.supabaseDbUrl) return null;
      if (!persistence) {
        const store = (overrides?.createPiSessionStore ?? createPiSessionStore)(env.supabaseDbUrl);
        persistence = {
          fileStore: store.fileStore,
          async loadMessages(threadId) {
            return await store.loadMessages(threadId) ?? [];
          },
          saveMessages: store.saveMessages,
        };
      }
      return persistence;
    },
  };
}
