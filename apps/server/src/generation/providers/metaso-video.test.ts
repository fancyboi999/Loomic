import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenerationError } from "../utils.js";
import {
  METASO_DEFAULT_BASE_URL,
  METASO_VIDEO_MODEL_ID,
  MetasoVideoProvider,
} from "./metaso-video.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("MetasoVideoProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("creates and polls a text-to-video task with the documented defaults", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ task_id: "task-1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            id: "task-1",
            status: "succeeded",
            modality: "video",
            content: { url: "https://cdn.example/video.mp4" },
            duration: 5,
            resolution: "768P",
            ratio: "16:9",
          },
        }),
      );

    const provider = new MetasoVideoProvider("secret", undefined, {
      fetch: fetchMock as typeof fetch,
    });
    const result = await provider.generate({
      model: METASO_VIDEO_MODEL_ID,
      prompt: "A paper crane takes flight",
    });

    expect(result).toEqual({
      url: "https://cdn.example/video.mp4",
      mimeType: "video/mp4",
      width: 1365,
      height: 768,
      durationSeconds: 5,
    });
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(createUrl.toString()).toBe(
      `${METASO_DEFAULT_BASE_URL}v2/video_generation`,
    );
    expect(createInit.headers).toMatchObject({
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(createInit.body as string)).toEqual({
      model: "MiniMax-H3",
      content: [{ type: "text", text: "A paper crane takes flight" }],
      resolution: "768P",
      duration: 5,
      ratio: "16:9",
    });
  });

  it("maps first/last frames and 1080p to adaptive 2K generation", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ task_id: "task-2" }))
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            status: "succeeded",
            content: { url: "https://cdn.example/2k.mp4" },
          },
        }),
      );

    const provider = new MetasoVideoProvider(
      "secret",
      "https://proxy.example/minimax",
      {
        fetch: fetchMock as typeof fetch,
      },
    );
    await provider.generate({
      model: METASO_VIDEO_MODEL_ID,
      prompt: "Transition between two frames",
      duration: 15,
      resolution: "1080p",
      inputImages: [
        "https://cdn.example/first.png",
        "data:image/png;base64,AAAA",
      ],
    });

    const [, createInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(createInit.body as string)).toMatchObject({
      resolution: "2K",
      duration: 15,
      ratio: "adaptive",
      content: [
        { type: "text", text: "Transition between two frames" },
        {
          type: "image_url",
          image_url: { url: "https://cdn.example/first.png" },
          role: "first_frame",
        },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,AAAA" },
          role: "last_frame",
        },
      ],
    });
  });

  it("polls queued and running tasks until success", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ task_id: "task-3" }))
      .mockResolvedValueOnce(jsonResponse({ task: { status: "queued" } }))
      .mockResolvedValueOnce(jsonResponse({ task: { status: "running" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            status: "succeeded",
            content: { url: "https://cdn.example/done.mp4" },
          },
        }),
      );

    let clock = 0;
    const provider = new MetasoVideoProvider("secret", undefined, {
      fetch: fetchMock as typeof fetch,
      pollIntervalMs: 1,
      maxWaitMs: 10,
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
    });

    await expect(
      provider.generate({ model: METASO_VIDEO_MODEL_ID, prompt: "test" }),
    ).resolves.toMatchObject({ url: "https://cdn.example/done.mp4" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([400, 401, 402, 422, 429, 500, 529])(
    "maps HTTP %s errors without leaking credentials",
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              type: `error_${status}`,
              message: "upstream failure super-secret",
            },
            request_id: "req-1",
          },
          status,
        ),
      );
      const provider = new MetasoVideoProvider("super-secret", undefined, {
        fetch: fetchMock as typeof fetch,
      });

      await expect(
        provider.generate({ model: METASO_VIDEO_MODEL_ID, prompt: "test" }),
      ).rejects.toMatchObject({
        provider: "metaso",
        code: `error_${status}`,
        message: "upstream failure [redacted] (request req-1)",
      });
    },
  );

  it("cancels a still-queued task after the polling deadline", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ task_id: "queued-task" }))
      .mockResolvedValueOnce(jsonResponse({ task: { status: "queued" } }))
      .mockResolvedValueOnce(
        jsonResponse({ task_id: "queued-task", status: "cancelled" }),
      );
    let clock = 0;
    const provider = new MetasoVideoProvider("secret", undefined, {
      fetch: fetchMock as typeof fetch,
      pollIntervalMs: 5,
      maxWaitMs: 5,
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
    });

    await expect(
      provider.generate({ model: METASO_VIDEO_MODEL_ID, prompt: "test" }),
    ).rejects.toMatchObject({ code: "timeout" });
    const [cancelUrl, cancelInit] = fetchMock.mock.calls[2] as [
      URL,
      RequestInit,
    ];
    expect(
      cancelUrl.pathname.endsWith("/v2/video_generation/queued-task"),
    ).toBe(true);
    expect(cancelInit.method).toBe("DELETE");
  });

  it("redacts credentials from asynchronous task failures", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ task_id: "failed-task" }))
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            status: "failed",
            error: { code: "task_failed", message: "key=super-secret" },
          },
        }),
      );
    const provider = new MetasoVideoProvider("super-secret", undefined, {
      fetch: fetchMock as typeof fetch,
    });

    await expect(
      provider.generate({ model: METASO_VIDEO_MODEL_ID, prompt: "test" }),
    ).rejects.toMatchObject({
      code: "task_failed",
      message: "key=[redacted]",
    });
  });

  it.each([
    [{ duration: 3 }, "duration"],
    [{ resolution: "480p" }, "resolution"],
    [{ aspectRatio: "2:1" }, "aspect ratio"],
    [{ inputImages: ["one", "two", "three"] as string[] }, "at most two"],
    [{ inputVideo: "https://cdn.example/source.mp4" }, "reference-video"],
    [{ enableAudio: true }, "audio generation"],
  ] as const)("rejects unsupported input %o", async (overrides, message) => {
    const provider = new MetasoVideoProvider("secret", undefined, {
      fetch: fetchMock as typeof fetch,
    });
    await expect(
      provider.generate({
        model: METASO_VIDEO_MODEL_ID,
        prompt: "test",
        ...overrides,
      }),
    ).rejects.toThrow(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid configuration and malformed responses", async () => {
    expect(() => new MetasoVideoProvider(" ")).toThrow(GenerationError);
    expect(
      () => new MetasoVideoProvider("secret", "ftp://example.com"),
    ).toThrow("HTTP or HTTPS");

    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const provider = new MetasoVideoProvider("secret", undefined, {
      fetch: fetchMock as typeof fetch,
    });
    await expect(
      provider.generate({ model: METASO_VIDEO_MODEL_ID, prompt: "test" }),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });
});
