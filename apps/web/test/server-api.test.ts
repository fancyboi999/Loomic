// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createProject,
  createRun,
  fetchProjects,
  fetchVideoModels,
  fetchViewer,
} from "../src/lib/server-api";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("authenticated server API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SERVER_BASE_URL", "http://localhost:3001");
  });

  it("fetchViewer sends bearer token and returns viewer response", async () => {
    const viewer = {
      profile: {
        id: "u1",
        email: "a@b.com",
        displayName: "A",
        avatarUrl: null,
      },
      workspace: { id: "w1", name: "W", type: "personal", ownerUserId: "u1" },
      membership: { workspaceId: "w1", userId: "u1", role: "owner" },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => viewer,
    });

    const result = await fetchViewer("token_abc");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/viewer",
      expect.objectContaining({
        headers: { Authorization: "Bearer token_abc" },
      }),
    );
    expect(result.profile.id).toBe("u1");
  });

  it("createRun sends bearer auth when access token is provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        runId: "run_123",
        sessionId: "session_123",
        conversationId: "conversation_123",
        status: "accepted",
      }),
    });

    await createRun(
      {
        sessionId: "session_123",
        conversationId: "conversation_123",
        prompt: "Hello",
      },
      { accessToken: "token_abc" },
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/agent/runs",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token_abc",
          "content-type": "application/json",
        },
      }),
    );
  });

  it("createRun keeps demo calls unauthenticated by default", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        runId: "run_123",
        sessionId: "session_123",
        conversationId: "conversation_123",
        status: "accepted",
      }),
    });

    await createRun({
      sessionId: "session_123",
      conversationId: "conversation_123",
      prompt: "Hello",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/agent/runs",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      }),
    );
  });

  it("createProject sends POST with bearer token and handles 201", async () => {
    const project = {
      project: {
        id: "p1",
        name: "Test",
        slug: "test",
        description: null,
        workspace: { id: "w1", name: "W", type: "personal", ownerUserId: "u1" },
        primaryCanvas: { id: "c1", name: "Main Canvas", isPrimary: true },
        createdAt: "2026-03-23T00:00:00Z",
        updatedAt: "2026-03-23T00:00:00Z",
      },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => project,
    });

    const result = await createProject("token_abc", { name: "Test" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/projects",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token_abc",
          "content-type": "application/json",
        }),
      }),
    );
    expect(result.project.id).toBe("p1");
  });

  it("fetchProjects sends bearer token and returns list", async () => {
    const list = { projects: [{ id: "p1", name: "Test", slug: "test" }] };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => list,
    });

    const result = await fetchProjects("token_abc");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/projects",
      expect.objectContaining({
        headers: { Authorization: "Bearer token_abc" },
      }),
    );
    expect(result.projects).toHaveLength(1);
  });

  it("fetchVideoModels preserves capability, limits, and verified pricing metadata", async () => {
    const payload = {
      models: [
        {
          id: "metaso/minimax-h3",
          displayName: "MiniMax H3 (Metaso)",
          description: "Metaso H3",
          provider: "metaso",
          creditCost: 51,
          capabilities: {
            textToVideo: true,
            imageToVideo: true,
            videoToVideo: false,
            audio: false,
          },
          limits: {
            maxDuration: 15,
            allowedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            maxResolution: "1080p",
            maxInputImages: 2,
          },
          pricing: {
            currency: "CNY",
            billingUnit: "generated_second",
            providerPointsName: "H3 points",
            evidenceDate: "2026-08-19",
            rates: [
              {
                resolution: "720p",
                displayResolution: "768P",
                providerPointsPerSecond: 10.2,
                cnyPerSecond: { min: 0.0897, max: 0.1102 },
              },
            ],
          },
        },
      ],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    const result = await fetchVideoModels();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/video-models",
    );
    expect(result.models[0]).toMatchObject({
      id: "metaso/minimax-h3",
      creditCost: 51,
      limits: { maxDuration: 15, maxInputImages: 2 },
      pricing: { evidenceDate: "2026-08-19" },
    });
  });

  it("createProject throws ApiApplicationError with code on 409", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: { code: "project_slug_taken", message: "Slug taken." },
      }),
    });

    await expect(createProject("token_abc", { name: "Dup" })).rejects.toThrow(
      "Slug taken.",
    );
    try {
      await createProject("token_abc", { name: "Dup" });
    } catch (err) {
      expect((err as { code?: string }).code).toBe("project_slug_taken");
    }
  });

  it("fetchViewer throws ApiAuthError on 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "unauthorized", message: "Bad token." },
      }),
    });

    await expect(fetchViewer("expired")).rejects.toThrow("unauthorized");
  });

  it("fetchProjects throws ApiAuthError on 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "unauthorized", message: "Bad token." },
      }),
    });

    await expect(fetchProjects("expired")).rejects.toThrow("unauthorized");
  });
});
