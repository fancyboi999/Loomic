import { describe, expect, it, vi } from "vitest";

import { createJobService } from "./job-service.js";

describe("PGMQ trace context", () => {
  it("forwards the Agent run and parent span to the Worker message", async () => {
    const send = vi.fn().mockResolvedValue(1);
    const row = { id: "job-1", job_type: "image_generation", status: "queued", payload: {} };
    const client = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) }) }),
    };
    const service = createJobService({
      createUserClient: () => client as any,
      getAdminClient: () => ({} as any),
      pgmq: { send } as any,
    });

    await service.createJob({ id: "user-1", accessToken: "token" } as any, {
      workspaceId: "workspace-1", sessionId: "chat-1", jobType: "image_generation",
      payload: { prompt: "cat" }, runId: "run-1", traceparent: `00-${"a".repeat(32)}-${"b".repeat(16)}-01`,
    });

    expect(send).toHaveBeenCalledWith("image_generation_jobs", expect.objectContaining({
      job_id: "job-1", run_id: "run-1", session_id: "chat-1",
      traceparent: `00-${"a".repeat(32)}-${"b".repeat(16)}-01`,
    }));
  });
});
