import { describe, expect, it, vi } from "vitest";

import type { AvailableVideoModel } from "../../generation/providers/registry.js";
import { createVideoGenerateTool, type SubmitVideoJobFn, runVideoGenerate } from "./video-generate.js";

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

describe("generate_video model preference", () => {
  it("does not silently enable other models when a selected ID is unavailable", async () => {
    const submitVideoJob = vi.fn<SubmitVideoJobFn>();
    const tool = createVideoGenerateTool({
      availableModels: [metasoModel],
      allowedModelIds: ["removed/model"],
      submitVideoJob,
    });
    const result = await tool.execute("call-1", input(), new AbortController().signal);
    expect(JSON.stringify(result)).toContain("not available");
    expect(submitVideoJob).not.toHaveBeenCalled();
  });

  it("limits the Pi tool to the models selected for this run", async () => {
    const selectedModel = { ...metasoModel, id: "google-vertex/veo-2", displayName: "Veo 2" };
    const submitVideoJob = vi.fn<SubmitVideoJobFn>().mockResolvedValue({
      jobId: "job-1",
      videoUrl: "https://cdn.example/video.mp4",
      width: 1365,
      height: 768,
      durationSeconds: 5,
      mimeType: "video/mp4",
    });
    const tool = createVideoGenerateTool({
      availableModels: [metasoModel, selectedModel],
      allowedModelIds: [selectedModel.id],
      submitVideoJob,
    });

    expect(tool.description).toContain(selectedModel.id);
    expect(tool.description).not.toContain(metasoModel.id);
    await expect(tool.execute("call-1", input(), new AbortController().signal)).rejects.toThrow();
    expect(submitVideoJob).not.toHaveBeenCalled();

    await tool.execute("call-2", input({ model: selectedModel.id }), new AbortController().signal);
    expect(submitVideoJob).toHaveBeenCalledWith(expect.objectContaining({ model: selectedModel.id }));
  });
});

describe("generate_video Veo prompt", () => {
  it("translates a Chinese prompt before submitting to Veo", async () => {
    const veoModel = { ...metasoModel, id: "google-vertex/veo-3.1-lite-generate-001" };
    const submit = vi.fn<SubmitVideoJobFn>().mockResolvedValue({
      jobId: "job-1",
      videoUrl: "https://cdn.example/video.mp4",
    });
    const translate = vi.fn().mockResolvedValue("One red ball rolls across a white table.");

    await runVideoGenerate(
      input({
        model: veoModel.id,
        prompt: "一颗红球在白色桌面滚动",
        placementX: 240,
        placementY: 800,
        placementWidth: 640,
        placementHeight: 360,
      }),
      submit,
      [veoModel],
      translate,
    );

    expect(translate).toHaveBeenCalledWith("一颗红球在白色桌面滚动");
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "One red ball rolls across a white table.",
      title: "Test video",
      placementX: 240,
      placementY: 800,
      placementWidth: 640,
      placementHeight: 360,
    }));
  });

  it("keeps the original prompt when optional translation fails", async () => {
    const veoModel = { ...metasoModel, id: "google-vertex/veo-3.1-lite-generate-001" };
    const submit = vi.fn<SubmitVideoJobFn>().mockResolvedValue({ jobId: "job-2" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await runVideoGenerate(
        input({ model: veoModel.id, prompt: "一颗红球" }),
        submit,
        [veoModel],
        async () => { throw new Error("translator unavailable"); },
      );
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ prompt: "一颗红球" }));
    } finally {
      warn.mockRestore();
    }
  });
});
