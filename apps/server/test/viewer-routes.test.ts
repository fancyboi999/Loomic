import { afterEach, describe, expect, it } from "vitest";

import {
  unauthenticatedErrorResponseSchema,
  viewerResponseSchema,
} from "@loomic/shared";

import { buildApp } from "../src/app.js";
import type { AuthenticatedUser } from "../src/supabase/user.js";

const appsUnderTest = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  await Promise.all(
    [...appsUnderTest].map(async (app) => {
      appsUnderTest.delete(app);
      await app.close();
    }),
  );
});

describe("viewer routes", () => {
  it("returns 401 when GET /api/viewer has no bearer token", async () => {
    const app = buildViewerApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/viewer",
    });

    expect(response.statusCode).toBe(401);
    expect(unauthenticatedErrorResponseSchema.parse(response.json())).toEqual({
      error: {
        code: "unauthorized",
        message: "Missing or invalid bearer token.",
      },
    });
  });

  it("bootstraps profile, personal workspace, and membership for a valid bearer token", async () => {
    const authUser = {
      accessToken: "viewer-token",
      email: "ada@example.com",
      id: "user-ada",
      userMetadata: {
        avatar_url: "https://example.com/avatar.png",
        full_name: "Ada Lovelace",
      },
    };
    const foundation = createFoundationStore();
    const app = buildViewerApp({
      auth: createAuthStub(authUser),
      viewerService: {
        async ensureViewer(user: AuthenticatedUser) {
          return foundation.ensure(user);
        },
      },
    });

    const firstResponse = await app.inject({
      method: "GET",
      url: "/api/viewer",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
      },
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(viewerResponseSchema.parse(firstResponse.json())).toEqual({
      membership: {
        role: "owner",
        userId: "user-ada",
        workspaceId: "workspace-user-ada",
      },
      profile: {
        avatarUrl: "https://example.com/avatar.png",
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        id: "user-ada",
      },
      workspace: {
        id: "workspace-user-ada",
        name: "Ada Lovelace Workspace",
        ownerUserId: "user-ada",
        type: "personal",
      },
    });
    expect(foundation.snapshot()).toEqual({
      membershipCount: 1,
      profileCount: 1,
      workspaceCount: 1,
    });

    const secondResponse = await app.inject({
      method: "GET",
      url: "/api/viewer",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
      },
    });

    expect(secondResponse.statusCode).toBe(200);
    expect(foundation.snapshot()).toEqual({
      membershipCount: 1,
      profileCount: 1,
      workspaceCount: 1,
    });
  });
});

function buildViewerApp(
  overrides: Record<string, unknown> = {},
): Awaited<ReturnType<typeof buildApp>> {
  const app = buildApp({
    env: {
      port: 3001,
      version: "9.9.9-test",
      webOrigin: "http://localhost:3000",
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
}) {
  return {
    async authenticate(request: { headers: { authorization?: string } }) {
      if (request.headers.authorization === `Bearer ${user.accessToken}`) {
        return user;
      }

      return null;
    },
  };
}

function createFoundationStore() {
  const profiles = new Map<string, ReturnType<typeof viewerResponseSchema.parse>["profile"]>();
  const workspaces = new Map<
    string,
    ReturnType<typeof viewerResponseSchema.parse>["workspace"]
  >();
  const memberships = new Map<
    string,
    ReturnType<typeof viewerResponseSchema.parse>["membership"]
  >();

  return {
    ensure(user: {
      email: string;
      id: string;
      userMetadata: Record<string, unknown>;
    }) {
      const displayName =
        typeof user.userMetadata.full_name === "string"
          ? user.userMetadata.full_name
          : (user.email.split("@")[0] ?? user.email);
      const avatarUrl =
        typeof user.userMetadata.avatar_url === "string"
          ? user.userMetadata.avatar_url
          : null;
      const workspaceId = `workspace-${user.id}`;

      if (!profiles.has(user.id)) {
        profiles.set(user.id, {
          avatarUrl,
          displayName,
          email: user.email,
          id: user.id,
        });
      }

      if (!workspaces.has(workspaceId)) {
        workspaces.set(workspaceId, {
          id: workspaceId,
          name: `${displayName} Workspace`,
          ownerUserId: user.id,
          type: "personal",
        });
      }

      const membershipKey = `${workspaceId}:${user.id}`;
      if (!memberships.has(membershipKey)) {
        memberships.set(membershipKey, {
          role: "owner",
          userId: user.id,
          workspaceId,
        });
      }

      return {
        membership: memberships.get(membershipKey)!,
        profile: profiles.get(user.id)!,
        workspace: workspaces.get(workspaceId)!,
      };
    },
    snapshot() {
      return {
        membershipCount: memberships.size,
        profileCount: profiles.size,
        workspaceCount: workspaces.size,
      };
    },
  };
}
