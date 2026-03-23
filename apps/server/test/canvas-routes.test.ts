import { afterEach, describe, expect, it } from "vitest";

import {
  applicationErrorResponseSchema,
  canvasGetResponseSchema,
  canvasSaveResponseSchema,
} from "@loomic/shared";

import { buildApp } from "../src/app.js";
import { CanvasServiceError } from "../src/features/canvas/canvas-service.js";
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

describe("canvas routes", () => {
  it("GET /api/canvases/:canvasId returns 200 with canvas detail", async () => {
    const authUser = {
      accessToken: "get-canvas-token",
      email: "user@example.com",
      id: "user-1",
      userMetadata: {},
    };

    const app = buildCanvasApp({
      auth: createAuthStub(authUser),
      canvasService: {
        async getCanvas(_user: AuthenticatedUser, canvasId: string) {
          return {
            id: canvasId,
            name: "Main Canvas",
            projectId: "project-1",
            content: { elements: [], appState: {} },
          };
        },
        async saveCanvasContent() {},
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/canvases/canvas-1",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(canvasGetResponseSchema.parse(response.json())).toEqual({
      canvas: {
        id: "canvas-1",
        name: "Main Canvas",
        projectId: "project-1",
        content: { elements: [], appState: {} },
      },
    });
  });

  it("GET /api/canvases/:canvasId returns 404 when canvas not found", async () => {
    const authUser = {
      accessToken: "get-canvas-404-token",
      email: "user@example.com",
      id: "user-1",
      userMetadata: {},
    };

    const app = buildCanvasApp({
      auth: createAuthStub(authUser),
      canvasService: {
        async getCanvas() {
          throw new CanvasServiceError(
            "canvas_not_found",
            "Canvas not found.",
            404,
          );
        },
        async saveCanvasContent() {},
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/canvases/missing-canvas",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(applicationErrorResponseSchema.parse(response.json())).toEqual({
      error: {
        code: "canvas_not_found",
        message: "Canvas not found.",
      },
    });
  });

  it("GET /api/canvases/:canvasId returns 401 when unauthenticated", async () => {
    const app = buildCanvasApp({
      auth: createAuthStub(null),
      canvasService: {
        async getCanvas() {
          throw new Error("should not be called");
        },
        async saveCanvasContent() {},
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/canvases/canvas-1",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "unauthorized" },
    });
  });

  it("PUT /api/canvases/:canvasId returns 200 on success", async () => {
    const authUser = {
      accessToken: "put-canvas-token",
      email: "user@example.com",
      id: "user-1",
      userMetadata: {},
    };

    const saveCalls: Array<{ canvasId: string }> = [];

    const app = buildCanvasApp({
      auth: createAuthStub(authUser),
      canvasService: {
        async getCanvas() {
          throw new Error("should not be called");
        },
        async saveCanvasContent(
          _user: AuthenticatedUser,
          canvasId: string,
        ) {
          saveCalls.push({ canvasId });
        },
      },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/canvases/canvas-1",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
        "content-type": "application/json",
      },
      payload: {
        content: {
          elements: [{ type: "rectangle", id: "elem-1" }],
          appState: { zoom: 2 },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(canvasSaveResponseSchema.parse(response.json())).toEqual({
      ok: true,
    });
    expect(saveCalls).toEqual([{ canvasId: "canvas-1" }]);
  });

  it("PUT /api/canvases/:canvasId returns 401 when unauthenticated", async () => {
    const app = buildCanvasApp({
      auth: createAuthStub(null),
      canvasService: {
        async getCanvas() {
          throw new Error("should not be called");
        },
        async saveCanvasContent() {
          throw new Error("should not be called");
        },
      },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/canvases/canvas-1",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        content: { elements: [], appState: {} },
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "unauthorized" },
    });
  });
});

function buildCanvasApp(
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
