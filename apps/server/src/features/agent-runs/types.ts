export type PersistedAgentRunStatus =
  | "accepted"
  | "running"
  | "completed"
  | "failed";

export type CreateAcceptedAgentRunInput = {
  model?: string;
  runId: string;
  sessionId: string;
  threadId: string;
};

export type UpdateAgentRunInput = {
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  runId: string;
  status: PersistedAgentRunStatus;
};
