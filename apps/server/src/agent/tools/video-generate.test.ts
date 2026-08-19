import { describe, expect, it, vi } from "vitest";

import type { AvailableVideoModel } from "../../generation/providers/registry.js";
import { type SubmitVideoJobFn, runVideoGenerate } from "./video-generate.js";

const metasoModel: AvailableVideoModel = {
  id: "metaso/minimax-h3",
  displayName: "MiniMax H3 (Metaso)",
  description: "Metaso H3",
  provider: "metaso",
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
};

function input(
  overrides: Partial<Parameters<typeof runVideoGenerate>[0]> = {},
): Parameters<typeof runVideoGenerate>[0] {
  return {
    title: "Test video",
    prompt: "A paper crane takes flight",
    model: metasoModel.id,
    duration: 5,
    resolution: "720p",
    aspectRatio: "16:9",
    enableAudio: true,
    ...overrides,
  };
}

describe("runVideoGenerate capability enforcement", () => {
  it("does not send the schema's audio default to a model without audio capability", async () => {
    const submit = vi.fn<SubmitVideoJobFn>().mockResolvedValue({
      jobId: "job-1",
      videoUrl: "https://cdn.example/video.mp4",
      width: 1365,
      height: 768,
      durationSeconds: 5,
      mimeType: "video/mp4",
    });

    await runVideoGenerate(input(), submit, [metasoModel]);

    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0]?.[0]).not.toHaveProperty("enableAudio");
  });

  it("rejects unsupported reference video and excess images before job submission", async () => {
    const submit = vi.fn<SubmitVideoJobFn>();

    const videoResult = await runVideoGenerate(
      input({ inputVideo: "https://cdn.example/source.mp4" }),
      submit,
      [metasoModel],
    );
    const imageResult = await runVideoGenerate(
      input({
        inputImages: [
          "https://cdn.example/1.png",
          "https://cdn.example/2.png",
          "https://cdn.example/3.png",
        ],
      }),
      submit,
      [metasoModel],
    );

    expect(videoResult.error).toContain("reference-video");
    expect(imageResult.error).toContain("at most 2");
    expect(submit).not.toHaveBeenCalled();
  });
});
