import { afterEach, describe, expect, it } from "vitest";

import type { WorkspaceSettings } from "@loomic/shared";
import {
  workspaceSettingsResponseSchema,
} from "@loomic/shared";

import { buildApp } from "../src/app.js";

const appsUnderTest = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  await Promise.all(
    [...appsUnderTest].map(async (app) => {
      appsUnderTest.delete(app);
      await app.close();
    }),
  );
});

const VIEWER_RESPONSE = {
  profile: {
    id: "user-1",
    email: "user@example.com",
    displayName: "Test User",
    avatarUrl: null,
  },
  workspace: {
    id: "ws-1",
    name: "Personal",
    type: "personal" as const,
    ownerUserId: "user-1",
  },
  membership: {
    workspaceId: "ws-1",
    userId: "user-1",
    role: "owner" as const,
  },
};

describe("settings routes", () => {
  it("GET /api/workspace/settings returns defaults when no settings exist", async () => {
    const authUser = stubUser();

    const app = buildSettingsApp({
      auth: createAuthStub(authUser),
      settingsService: {
        async getWorkspaceSettings() {
          return { defaultModel: "gpt-5.4-mini" };
        },
        async updateWorkspaceSettings(_u: unknown, _w: unknown, s: WorkspaceSettings) {
          return s;
        },
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/workspace/settings",
      headers: { authorization: `Bearer ${authUser.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(workspaceSettingsResponseSchema.parse(response.json())).toEqual({
      settings: { defaultModel: "gpt-5.4-mini" },
    });
  });

  it("PUT /api/workspace/settings updates and returns new settings", async () => {
    const authUser = stubUser();
    const updateCalls: Array<{ workspaceId: string; defaultModel: string }> = [];

    const app = buildSettingsApp({
      auth: createAuthStub(authUser),
      settingsService: {
        async getWorkspaceSettings() {
          return { defaultModel: "gpt-5.4-mini" };
        },
        async updateWorkspaceSettings(_u: unknown, workspaceId: string, s: WorkspaceSettings) {
          updateCalls.push({ workspaceId, defaultModel: s.defaultModel });
          return s;
        },
      },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/workspace/settings",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
        "content-type": "application/json",
      },
      payload: { defaultModel: "gpt-4o" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      settings: { defaultModel: "gpt-4o" },
    });
    expect(updateCalls).toEqual([
      { workspaceId: "ws-1", defaultModel: "gpt-4o" },
    ]);
  });

  it("GET /api/workspace/settings returns 401 when unauthenticated", async () => {
    const app = buildSettingsApp({
      auth: createAuthStub(null),
      settingsService: {
        async getWorkspaceSettings() {
          throw new Error("should not be called");
        },
        async updateWorkspaceSettings() {
          throw new Error("should not be called");
        },
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/workspace/settings",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "unauthorized" },
    });
  });

  it("PUT /api/workspace/settings returns 400 for invalid body", async () => {
    const authUser = stubUser();

    const app = buildSettingsApp({
      auth: createAuthStub(authUser),
      settingsService: {
        async getWorkspaceSettings() {
          return { defaultModel: "gpt-5.4-mini" };
        },
        async updateWorkspaceSettings(_u: unknown, _w: unknown, s: WorkspaceSettings) {
          return s;
        },
      },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/workspace/settings",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
        "content-type": "application/json",
      },
      payload: { defaultModel: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "Invalid request body" });
  });

  it("GET /api/models returns available models list", async () => {
    const app = buildSettingsApp({
      auth: createAuthStub(null),
      settingsService: {
        async getWorkspaceSettings() {
          return { defaultModel: "gpt-5.4-mini" };
        },
        async updateWorkspaceSettings(_u: unknown, _w: unknown, s: WorkspaceSettings) {
          return s;
        },
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/models",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { models: Array<{ id: string; name: string; provider: string }> };
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0]).toHaveProperty("id");
    expect(body.models[0]).toHaveProperty("name");
    expect(body.models[0]).toHaveProperty("provider");
    expect(body.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "az_sre/gpt-5.4",
          name: "AZ SRE GPT-5.4",
          provider: "openai",
        }),
      ]),
    );
  });
});

function stubUser() {
  return {
    accessToken: "settings-test-token",
    email: "user@example.com",
    id: "user-1",
    userMetadata: {},
  };
}

function buildSettingsApp(
  overrides: Record<string, unknown> = {},
): Awaited<ReturnType<typeof buildApp>> {
  const app = buildApp({
    env: {
      port: 3001,
      version: "9.9.9-test",
      webOrigin: "http://localhost:3000",
    },
    viewerService: {
      async ensureViewer() {
        return VIEWER_RESPONSE;
      },
    },
    ...overrides,
  });
  appsUnderTest.add(app);
  return app;
}

function createAuthStub(user: {
  accessToken: string;
  email: string;
  id: string;
  userMetadata: Record<string, unknown>;
} | null) {
  return {
    async authenticate(request: { headers: { authorization?: string } }) {
      if (!user) return null;
      if (request.headers.authorization === `Bearer ${user.accessToken}`) {
        return user;
      }
      return null;
    },
  };
}
