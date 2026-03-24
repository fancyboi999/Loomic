import type { AdminSupabaseClient } from "../../supabase/admin.js";
import type {
  CreateAcceptedAgentRunInput,
  UpdateAgentRunInput,
} from "./types.js";

export class AgentRunPersistenceError extends Error {
  readonly statusCode: number;
  readonly code: "application_error";

  constructor(message: string, statusCode = 500) {
    super(message);
    this.code = "application_error";
    this.statusCode = statusCode;
  }
}

export type AgentRunMetadataService = {
  createAcceptedRun(input: CreateAcceptedAgentRunInput): Promise<void>;
  updateRun(input: UpdateAgentRunInput): Promise<void>;
};

export function createAgentRunMetadataService(options: {
  getAdminClient: () => AdminSupabaseClient;
}): AgentRunMetadataService {
  return {
    async createAcceptedRun(input) {
      const { error } = await options.getAdminClient().from("agent_runs").insert({
        id: input.runId,
        model: input.model ?? null,
        session_id: input.sessionId,
        status: "accepted",
        thread_id: input.threadId,
      });

      if (error) {
        throw new AgentRunPersistenceError("Failed to persist accepted run.");
      }
    },

    async updateRun(input) {
      const patch = {
        ...(input.completedAt ? { completed_at: input.completedAt } : {}),
        ...(input.errorCode ? { error_code: input.errorCode } : {}),
        ...(input.errorMessage ? { error_message: input.errorMessage } : {}),
        status: input.status,
      };
      const { error } = await options.getAdminClient()
        .from("agent_runs")
        .update(patch)
        .eq("id", input.runId);

      if (error) {
        throw new AgentRunPersistenceError("Failed to update run metadata.");
      }
    },
  };
}
