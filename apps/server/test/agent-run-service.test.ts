import { describe, expect, it, vi } from "vitest";

import {
  AgentRunPersistenceError,
  createAgentRunMetadataService,
} from "../src/features/agent-runs/agent-run-service.js";

describe("agent run metadata service", () => {
  it("persists accepted runs with session and thread metadata", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const service = createAgentRunMetadataService({
      getAdminClient: () =>
        createAdminClientStub({
          insert,
          update: vi.fn(),
        }),
    });

    await service.createAcceptedRun({
      model: "gpt-5.4-mini",
      runId: "run-1",
      sessionId: "session-1",
      threadId: "thread-1",
    });

    expect(insert).toHaveBeenCalledWith({
      id: "run-1",
      model: "gpt-5.4-mini",
      session_id: "session-1",
      status: "accepted",
      thread_id: "thread-1",
    });
  });

  it("updates persisted run status", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const service = createAgentRunMetadataService({
      getAdminClient: () =>
        createAdminClientStub({
          insert: vi.fn(),
          update,
        }),
    });

    await service.updateRun({
      completedAt: "2026-03-24T00:00:00.000Z",
      errorCode: "run_failed",
      errorMessage: "stream failed",
      runId: "run-1",
      status: "failed",
    });

    expect(update).toHaveBeenCalledWith({
      completed_at: "2026-03-24T00:00:00.000Z",
      error_code: "run_failed",
      error_message: "stream failed",
      status: "failed",
    });
    expect(eq).toHaveBeenCalledWith("id", "run-1");
  });

  it("raises a persistence error when insert fails", async () => {
    const service = createAgentRunMetadataService({
      getAdminClient: () =>
        createAdminClientStub({
          insert: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
          update: vi.fn(),
        }),
    });

    await expect(
      service.createAcceptedRun({
        runId: "run-1",
        sessionId: "session-1",
        threadId: "thread-1",
      }),
    ).rejects.toBeInstanceOf(AgentRunPersistenceError);
  });
});

function createAdminClientStub(spies: {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}) {
  return {
    from() {
      return {
        insert: spies.insert,
        update: spies.update,
      };
    },
  } as never;
}
