import { describe, expect, it, vi } from "vitest";

import { createCanvasService } from "./canvas-service.js";

describe("canvas video URL refresh", () => {
  it("re-signs generated videos from their stable object path on load", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "http://storage.example/new-token" }, error: null });
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "canvas-1", name: "Canvas", project_id: "project-1",
        content: { elements: [
          { id: "video-1", type: "embeddable", link: "http://storage.example/expired", customData: { isVideo: true, objectPath: "workspace/video.mp4" } },
          { id: "other", type: "rectangle" },
        ], appState: {} },
      },
      error: null,
    });
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
      storage: { from: () => ({ createSignedUrl }) },
    };
    const service = createCanvasService({ createUserClient: () => client as any });
    const canvas = await service.getCanvas({ accessToken: "token" } as any, "canvas-1");

    expect(createSignedUrl).toHaveBeenCalledWith("workspace/video.mp4", 60 * 60 * 24 * 7);
    expect((canvas.content.elements as any[])[0].link).toBe("http://storage.example/new-token");
    expect((canvas.content.elements as any[])[1]).toEqual({ id: "other", type: "rectangle" });
  });
});
