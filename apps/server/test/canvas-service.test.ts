import { describe, expect, it } from "vitest";

import {
  createCanvasService,
  CanvasServiceError,
} from "../src/features/canvas/canvas-service.js";

describe("createCanvasService", () => {
  describe("getCanvas", () => {
    it("returns a canvas detail when found", async () => {
      const user = mockUser("user-1");
      const canvasRow = {
        id: "canvas-1",
        name: "Main Canvas",
        project_id: "project-1",
        content: { elements: [], appState: { zoom: 1 } },
      };
      const service = createCanvasService({
        createUserClient: () =>
          createMockUserClient({ canvasRow }) as any,
      });

      const result = await service.getCanvas(user, "canvas-1");

      expect(result).toEqual({
        id: "canvas-1",
        name: "Main Canvas",
        projectId: "project-1",
        content: { elements: [], appState: { zoom: 1 } },
      });
    });

    it("defaults to empty content when content is null", async () => {
      const user = mockUser("user-1");
      const canvasRow = {
        id: "canvas-2",
        name: "Empty Canvas",
        project_id: "project-1",
        content: null,
      };
      const service = createCanvasService({
        createUserClient: () =>
          createMockUserClient({ canvasRow }) as any,
      });

      const result = await service.getCanvas(user, "canvas-2");

      expect(result.content).toEqual({ elements: [], appState: {} });
    });

    it("throws canvas_not_found when data is null", async () => {
      const user = mockUser("user-1");
      const service = createCanvasService({
        createUserClient: () =>
          createMockUserClient({ canvasRow: null }) as any,
      });

      await expect(
        service.getCanvas(user, "missing-canvas"),
      ).rejects.toMatchObject({
        code: "canvas_not_found",
        statusCode: 404,
      });
    });

    it("throws canvas_not_found when Supabase returns an error", async () => {
      const user = mockUser("user-1");
      const service = createCanvasService({
        createUserClient: () =>
          createMockUserClient({
            canvasRow: null,
            singleError: { message: "no rows found" },
          }) as any,
      });

      await expect(
        service.getCanvas(user, "bad-canvas"),
      ).rejects.toBeInstanceOf(CanvasServiceError);
    });
  });

  describe("saveCanvasContent", () => {
    it("resolves without error on successful update", async () => {
      const user = mockUser("user-1");
      const service = createCanvasService({
        createUserClient: () =>
          createMockUserClient({ updateError: null }) as any,
      });

      await expect(
        service.saveCanvasContent(
          user,
          "canvas-1",
          { elements: [], appState: {}, files: {} },
        ),
      ).resolves.toBeUndefined();
    });

    it("throws canvas_save_failed when update returns an error", async () => {
      const user = mockUser("user-1");
      const service = createCanvasService({
        createUserClient: () =>
          createMockUserClient({
            updateError: { message: "update failed" },
          }) as any,
      });

      await expect(
        service.saveCanvasContent(
          user,
          "canvas-1",
          { elements: [], appState: {}, files: {} },
        ),
      ).rejects.toMatchObject({
        code: "canvas_save_failed",
        statusCode: 500,
      });
    });
  });
});

function mockUser(id: string) {
  return {
    accessToken: `token-${id}`,
    email: `${id}@example.com`,
    id,
    userMetadata: {},
  };
}

function createMockUserClient(options: {
  canvasRow?: Record<string, unknown> | null;
  singleError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  return {
    from(_table: string) {
      return createChain(options);
    },
  };
}

function createChain(options: {
  canvasRow?: Record<string, unknown> | null;
  singleError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const chain = {
    select() {
      return chain;
    },
    update(_data: unknown) {
      return chain;
    },
    eq() {
      return chain;
    },
    single() {
      if (options.singleError) {
        return Promise.resolve({
          data: null,
          error: options.singleError,
        });
      }
      return Promise.resolve({
        data: options.canvasRow ?? null,
        error: options.canvasRow ? null : { message: "no rows" },
      });
    },
    then(
      resolve: (v: unknown) => void,
      reject?: (e: unknown) => void,
    ) {
      // Used by update chain (no .single())
      return Promise.resolve({
        data: null,
        error: options.updateError ?? null,
      }).then(resolve, reject);
    },
  };
  return chain;
}
