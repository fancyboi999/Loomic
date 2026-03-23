import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import type {
  RunCancelResponse,
  RunCreateRequest,
  RunCreateResponse,
  StreamEvent,
} from "@loomic/shared";

type MockRunStatus = "accepted" | "running" | "completed" | "canceled";

type MockRunRecord = RunCreateRequest & {
  runId: string;
  controller: AbortController;
  messageId: string;
  status: MockRunStatus;
  streamConsumed: boolean;
  toolCallId: string;
};

type CreateMockRunStoreOptions = {
  eventDelayMs?: number;
  now?: () => string;
  runIdFactory?: () => string;
};

export type MockRunStore = ReturnType<typeof createMockRunStore>;

export function createMockRunStore(options: CreateMockRunStoreOptions = {}) {
  const eventDelayMs = options.eventDelayMs ?? 25;
  const now = options.now ?? (() => new Date().toISOString());
  const runIdFactory = options.runIdFactory ?? (() => `run_${randomUUID()}`);
  const runs = new Map<string, MockRunRecord>();

  return {
    cancelRun(runId: string): RunCancelResponse | null {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }

      if (!run.controller.signal.aborted) {
        run.controller.abort();
      }

      run.status = "canceled";
      return {
        runId,
        status: "canceled",
      };
    },

    createRun(input: RunCreateRequest): RunCreateResponse {
      const runId = runIdFactory();
      runs.set(runId, {
        ...input,
        controller: new AbortController(),
        messageId: `message_${runId}`,
        runId,
        status: "accepted",
        streamConsumed: false,
        toolCallId: `tool_${runId}`,
      });

      return {
        runId,
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        status: "accepted",
      };
    },

    hasRun(runId: string) {
      return runs.has(runId);
    },

    async *streamRun(runId: string): AsyncGenerator<StreamEvent> {
      const run = runs.get(runId);
      if (!run) {
        throw new Error(`Run not found: ${runId}`);
      }

      if (run.streamConsumed) {
        return;
      }

      run.streamConsumed = true;
      run.status = "running";

      const events: StreamEvent[] = [
        {
          type: "run.started",
          runId: run.runId,
          sessionId: run.sessionId,
          conversationId: run.conversationId,
          timestamp: now(),
        },
        {
          type: "message.delta",
          runId: run.runId,
          messageId: run.messageId,
          delta: `Mock response for: ${run.prompt}`,
          timestamp: now(),
        },
        {
          type: "tool.started",
          runId: run.runId,
          toolCallId: run.toolCallId,
          toolName: "mock.search",
          timestamp: now(),
        },
        {
          type: "tool.completed",
          runId: run.runId,
          toolCallId: run.toolCallId,
          toolName: "mock.search",
          outputSummary: "Mock tool completed",
          timestamp: now(),
        },
        {
          type: "run.completed",
          runId: run.runId,
          timestamp: now(),
        },
      ];

      for (const [index, event] of events.entries()) {
        if (run.controller.signal.aborted) {
          run.status = "canceled";
          return;
        }

        yield event;

        if (index < events.length - 1) {
          try {
            await delay(eventDelayMs, undefined, {
              signal: run.controller.signal,
            });
          } catch {
            run.status = "canceled";
            return;
          }
        }
      }

      run.status = "completed";
    },
  };
}
