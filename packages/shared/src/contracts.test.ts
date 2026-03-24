import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import {
  type Database,
  errorCodeValues,
  healthResponseSchema,
  runCancelResponseSchema,
  runCreateRequestSchema,
  runCreateResponseSchema,
  streamEventSchema,
} from "./index.js";
import * as sharedExports from "./index.js";

const databaseTypeSource = readFileSync(
  new URL("./supabase/database.ts", import.meta.url),
  "utf8",
);

describe("@loomic/shared contracts", () => {
  it("shares the health response schema for server and web", () => {
    const parsed = healthResponseSchema.parse({
      ok: true,
      service: "loomic-server",
      version: "0.1.0",
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.service).toBe("loomic-server");
  });

  it("accepts canvasId as optional field", () => {
    const result = runCreateRequestSchema.parse({
      sessionId: "session-1",
      conversationId: "conv-1",
      prompt: "Hello",
      canvasId: "canvas-1",
    });
    expect(result.canvasId).toBe("canvas-1");
  });

  it("succeeds without canvasId (backward compat)", () => {
    const result = runCreateRequestSchema.parse({
      sessionId: "session-1",
      conversationId: "conv-1",
      prompt: "Hello",
    });
    expect(result.canvasId).toBeUndefined();
  });

  it("accepts sessionId and conversationId for run creation", () => {
    const request = runCreateRequestSchema.parse({
      sessionId: "session_123",
      conversationId: "conversation_123",
      prompt: "Create a new storyboard outline",
    });

    const response = runCreateResponseSchema.parse({
      runId: "run_123",
      sessionId: request.sessionId,
      conversationId: request.conversationId,
      status: "accepted",
    });

    expect(request.sessionId).toBe("session_123");
    expect(response.status).toBe("accepted");
  });

  it("rejects run creation without a real sessionId", () => {
    expect(() =>
      runCreateRequestSchema.parse({
        conversationId: "conversation_123",
        prompt: "Create a new storyboard outline",
      }),
    ).toThrow();
  });

  it("shares a stable cancel response schema", () => {
    const parsed = runCancelResponseSchema.parse({
      runId: "run_123",
      status: "canceling",
    });

    expect(parsed.status).toBe("canceling");
  });

  it("shares the viewer bootstrap contract for GET /api/viewer", () => {
    const viewerResponseSchema = getExportedSchema("viewerResponseSchema");

    const parsed = viewerResponseSchema.parse({
      profile: {
        id: "user_123",
        email: "maker@loomic.test",
        displayName: "Loomic Maker",
        avatarUrl: "https://example.com/avatar.png",
      },
      workspace: {
        id: "workspace_123",
        name: "Loomic Maker",
        type: "personal",
        ownerUserId: "user_123",
      },
      membership: {
        workspaceId: "workspace_123",
        userId: "user_123",
        role: "owner",
      },
    });

    expect(parsed.profile.id).toBe("user_123");
    expect(parsed.workspace.ownerUserId).toBe("user_123");
    expect(parsed.membership.workspaceId).toBe("workspace_123");
  });

  it("shares project list and create contracts for GET/POST /api/projects", () => {
    const projectListResponseSchema = getExportedSchema(
      "projectListResponseSchema",
    );
    const projectCreateRequestSchema = getExportedSchema(
      "projectCreateRequestSchema",
    );
    const projectCreateResponseSchema = getExportedSchema(
      "projectCreateResponseSchema",
    );

    const createRequest = projectCreateRequestSchema.parse({
      name: "Brand System",
      description: "Primary workspace project",
    });

    const parsedList = projectListResponseSchema.parse({
      projects: [
        {
          id: "project_123",
          name: createRequest.name,
          slug: "brand-system",
          description: createRequest.description,
          workspace: {
            id: "workspace_123",
            name: "Loomic Maker",
            type: "personal",
            ownerUserId: "user_123",
          },
          primaryCanvas: {
            id: "canvas_123",
            name: "Main Canvas",
            isPrimary: true,
          },
          createdAt: "2026-03-23T12:00:00.000Z",
          updatedAt: "2026-03-23T12:00:00.000Z",
        },
      ],
    });
    const createdProject = projectCreateResponseSchema.parse({
      project: parsedList.projects[0],
    });

    expect(parsedList.projects[0].id).toBe("project_123");
    expect(parsedList.projects[0].workspace.ownerUserId).toBe("user_123");
    expect(parsedList.projects[0].primaryCanvas.id).toBe("canvas_123");
    expect(createdProject.project.primaryCanvas.isPrimary).toBe(true);
  });

  it("shares stable unauthenticated and application error payloads", () => {
    const unauthenticatedErrorResponseSchema = getExportedSchema(
      "unauthenticatedErrorResponseSchema",
    );
    const applicationErrorResponseSchema = getExportedSchema(
      "applicationErrorResponseSchema",
    );

    const unauthenticated = unauthenticatedErrorResponseSchema.parse({
      error: {
        code: "unauthorized",
        message: "Authentication is required.",
      },
    });
    const applicationError = applicationErrorResponseSchema.parse({
      error: {
        code: "project_create_failed",
        message: "Unable to create project.",
      },
    });

    expect(unauthenticated.error.code).toBe("unauthorized");
    expect(JSON.parse(JSON.stringify(applicationError))).toEqual(
      applicationError,
    );
  });

  it("rejects an empty project name in project create requests", () => {
    const projectCreateRequestSchema = getExportedSchema(
      "projectCreateRequestSchema",
    );

    expect(() =>
      projectCreateRequestSchema.parse({
        name: "",
      }),
    ).toThrow();
  });

  it("rejects a whitespace-only project name", () => {
    const schema = getExportedSchema("projectCreateRequestSchema");
    const result = schema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("trims a valid project name", () => {
    const schema = getExportedSchema("projectCreateRequestSchema");
    const result = schema.safeParse({ name: "  My Project  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My Project");
    }
  });

  it("trims a valid project description", () => {
    const schema = getExportedSchema("projectCreateRequestSchema");
    const result = schema.safeParse({
      name: "Test",
      description: "  Some desc  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Some desc");
    }
  });

  it("rejects a project response without primary canvas metadata", () => {
    const projectListResponseSchema = getExportedSchema(
      "projectListResponseSchema",
    );

    expect(() =>
      projectListResponseSchema.parse({
        projects: [
          {
            id: "project_123",
            name: "Brand System",
            slug: "brand-system",
            description: "Primary workspace project",
            workspace: {
              id: "workspace_123",
              name: "Loomic Maker",
              type: "personal",
              ownerUserId: "user_123",
            },
            createdAt: "2026-03-23T12:00:00.000Z",
            updatedAt: "2026-03-23T12:00:00.000Z",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects invalid application error codes", () => {
    const applicationErrorResponseSchema = getExportedSchema(
      "applicationErrorResponseSchema",
    );

    expect(() =>
      applicationErrorResponseSchema.parse({
        error: {
          code: "database_exploded",
          message: "Unexpected failure.",
        },
      }),
    ).toThrow();
  });

  it("includes the required minimum stream event union", () => {
    const eventTypes = [
      "run.started",
      "message.delta",
      "tool.started",
      "tool.completed",
      "run.canceled",
      "run.completed",
      "run.failed",
    ];

    for (const type of eventTypes) {
      expect(() => {
        switch (type) {
          case "run.started":
            streamEventSchema.parse({
              type,
              runId: "run_123",
              sessionId: "session_123",
              conversationId: "conversation_123",
              timestamp: "2026-03-23T12:00:00.000Z",
            });
            break;
          case "message.delta":
            streamEventSchema.parse({
              type,
              runId: "run_123",
              messageId: "message_123",
              delta: "hello",
              timestamp: "2026-03-23T12:00:00.000Z",
            });
            break;
          case "tool.started":
            streamEventSchema.parse({
              type,
              runId: "run_123",
              toolCallId: "tool_123",
              toolName: "example_tool",
              timestamp: "2026-03-23T12:00:00.000Z",
            });
            break;
          case "tool.completed":
            streamEventSchema.parse({
              type,
              runId: "run_123",
              toolCallId: "tool_123",
              toolName: "example_tool",
              outputSummary: "done",
              timestamp: "2026-03-23T12:00:00.000Z",
            });
            break;
          case "run.completed":
            streamEventSchema.parse({
              type,
              runId: "run_123",
              timestamp: "2026-03-23T12:00:00.000Z",
            });
            break;
          case "run.canceled":
            streamEventSchema.parse({
              type,
              runId: "run_123",
              timestamp: "2026-03-23T12:00:00.000Z",
            });
            break;
          case "run.failed":
            streamEventSchema.parse({
              type,
              runId: "run_123",
              error: {
                code: "run_failed",
                message: "The run failed.",
              },
              timestamp: "2026-03-23T12:00:00.000Z",
            });
            break;
          default:
            throw new Error(`Unexpected event type: ${type}`);
        }
      }).not.toThrow();
    }
  });

  it("keeps stable messageId and toolCallId correlation fields", () => {
    const messageEvent = streamEventSchema.parse({
      type: "message.delta",
      runId: "run_123",
      messageId: "message_123",
      delta: "hello",
      timestamp: "2026-03-23T12:00:00.000Z",
    });

    const toolEvent = streamEventSchema.parse({
      type: "tool.completed",
      runId: "run_123",
      toolCallId: "tool_123",
      toolName: "project_search",
      outputSummary: "Matched 2 files",
      timestamp: "2026-03-23T12:00:01.000Z",
    });

    if (messageEvent.type !== "message.delta") {
      throw new Error("Expected message.delta event.");
    }

    if (toolEvent.type !== "tool.completed") {
      throw new Error("Expected tool.completed event.");
    }

    expect(messageEvent.messageId).toBe("message_123");
    expect(toolEvent.toolCallId).toBe("tool_123");
  });

  it("requires correlation fields for message and tool lifecycle events", () => {
    expect(() =>
      streamEventSchema.parse({
        type: "message.delta",
        runId: "run_123",
        delta: "hello",
        timestamp: "2026-03-23T12:00:00.000Z",
      }),
    ).toThrow();

    expect(() =>
      streamEventSchema.parse({
        type: "tool.completed",
        runId: "run_123",
        toolName: "project_search",
        outputSummary: "Matched 2 files",
        timestamp: "2026-03-23T12:00:01.000Z",
      }),
    ).toThrow();
  });

  it("exports stable error codes that serialize as plain JSON", () => {
    expect(errorCodeValues).toEqual([
      "invalid_request",
      "run_not_found",
      "run_conflict",
      "run_failed",
      "tool_failed",
    ]);
    expect(JSON.parse(JSON.stringify(errorCodeValues))).toEqual(
      errorCodeValues,
    );
  });

  it("keeps run creation response stable for clients while hiding checkpoint internals", () => {
    const response = runCreateResponseSchema.parse({
      runId: "run_123",
      sessionId: "session_123",
      conversationId: "conversation_123",
      status: "accepted",
      checkpointId: "checkpoint_123",
      checkpointNamespace: "root",
    });

    expect(response).toEqual({
      runId: "run_123",
      sessionId: "session_123",
      conversationId: "conversation_123",
      status: "accepted",
    });
  });

  it("tracks server-owned thread_id in shared Supabase typings", () => {
    expect(databaseTypeSource).toMatch(/thread_id:\s*string \| null/);
  });

  it("declares shared agent_runs persistence typings", () => {
    expect(databaseTypeSource).toMatch(/agent_runs:\s*{/);
    expect(databaseTypeSource).toMatch(/session_id:\s*string/);
    expect(databaseTypeSource).toMatch(/thread_id:\s*string/);
  });

  it("tracks official langgraph persistence schema typings", () => {
    expect(databaseTypeSource).toMatch(/langgraph:\s*{/);
    expect(databaseTypeSource).toMatch(/checkpoint_migrations:\s*{/);
    expect(databaseTypeSource).toMatch(/checkpoints:\s*{/);
    expect(databaseTypeSource).toMatch(/checkpoint_blobs:\s*{/);
    expect(databaseTypeSource).toMatch(/checkpoint_writes:\s*{/);
    expect(databaseTypeSource).toMatch(/store:\s*{/);
  });
});

type AssertTrue<T extends true> = T;
type Extends<T, U> = [T] extends [U] ? true : false;

const chatSessionRowSupportsServerOwnedThreadId: AssertTrue<
  Extends<
    Database["public"]["Tables"]["chat_sessions"]["Row"],
    { thread_id: string | null }
  >
> = true;

const agentRunsRowTracksSessionAndThread: AssertTrue<
  Extends<
    Database["public"]["Tables"]["agent_runs"]["Row"],
    {
      session_id: string;
      thread_id: string;
      status: string;
      created_at: string;
      completed_at: string | null;
      error_code: string | null;
      error_message: string | null;
    }
  >
> = true;

void chatSessionRowSupportsServerOwnedThreadId;
void agentRunsRowTracksSessionAndThread;

const langgraphCheckpointsRowMatchesOfficialSchema: AssertTrue<
  Extends<
    Database["langgraph"]["Tables"]["checkpoints"]["Row"],
    {
      thread_id: string;
      checkpoint_ns: string;
      checkpoint_id: string;
      checkpoint: unknown;
      metadata: unknown;
    }
  >
> = true;

void langgraphCheckpointsRowMatchesOfficialSchema;

function getExportedSchema(name: string): ZodType {
  const candidate = (sharedExports as Record<string, unknown>)[name];

  expect(candidate, `${name} export is missing`).toBeDefined();

  if (
    !candidate ||
    typeof candidate !== "object" ||
    !("parse" in candidate) ||
    typeof candidate.parse !== "function"
  ) {
    throw new Error(`${name} is not a Zod schema export.`);
  }

  return candidate as ZodType;
}
