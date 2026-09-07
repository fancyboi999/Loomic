import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ATLAS_CLOUD_IMAGE_MODEL_ID,
  AtlasCloudImageProvider,
} from "./atlas-cloud-image.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("AtlasCloudImageProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => fetchMock.mockReset());

  it("creates one task and polls until completion", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ data: { id: "task-1", status: "created" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: { id: "task-1", status: "processing" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: "task-1",
            status: "completed",
            outputs: ["https://cdn.example/image.png"],
          },
        }),
      );
    let clock = 0;
    const provider = new AtlasCloudImageProvider("secret", undefined, {
      fetch: fetchMock as typeof fetch,
      pollIntervalMs: 1,
      maxWaitMs: 5,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    await expect(
      provider.generate({
        model: ATLAS_CLOUD_IMAGE_MODEL_ID,
        prompt: "Editorial product photograph",
        aspectRatio: "16:9",
        outputFormat: "png",
      }),
    ).resolves.toEqual({
      url: "https://cdn.example/image.png",
      mimeType: "image/png",
      width: 2848,
      height: 1600,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
    expect(
      JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string),
    ).toEqual({
      model: ATLAS_CLOUD_IMAGE_MODEL_ID,
      prompt: "Editorial product photograph",
      size: "2848*1600",
      output_format: "png",
    });
  });

  it("does not retry a failed creation request and redacts the key", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: "bad secret" } }, 401),
    );
    const provider = new AtlasCloudImageProvider("secret", undefined, {
      fetch: fetchMock as typeof fetch,
    });

    await expect(
      provider.generate({ model: ATLAS_CLOUD_IMAGE_MODEL_ID, prompt: "test" }),
    ).rejects.toMatchObject({
      provider: "atlas-cloud",
      code: "http_401",
      message: "bad [redacted]",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects image input before making a request", async () => {
    const provider = new AtlasCloudImageProvider("secret", undefined, {
      fetch: fetchMock as typeof fetch,
    });
    await expect(
      provider.generate({
        model: ATLAS_CLOUD_IMAGE_MODEL_ID,
        prompt: "test",
        inputImages: ["https://example.com/input.png"],
      }),
    ).rejects.toMatchObject({ code: "unsupported_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
