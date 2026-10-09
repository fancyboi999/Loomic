import { describe, expect, it, vi } from "vitest";

import { createImageGenerateTool } from "./image-generate.js";

const models = [
  { id: "model-a", displayName: "A", description: "A", provider: "test" },
  { id: "model-b", displayName: "B", description: "B", provider: "test" },
];

describe("generate_image model preference", () => {
  it("limits the Pi tool to the models selected for this run", async () => {
    const submitImageJob = vi.fn().mockResolvedValue({ jobId: "job-1", imageUrl: "https://example.test/image.png" });
    const tool = createImageGenerateTool({
      availableModels: models,
      allowedModelIds: ["model-b"],
      submitImageJob,
    });

    expect(tool.description).toContain("model-b");
    expect(tool.description).not.toContain("model-a");
    await expect(tool.execute("call-1", {
      title: "Square",
      prompt: "A square",
      model: "model-a",
    }, new AbortController().signal)).rejects.toThrow();
    expect(submitImageJob).not.toHaveBeenCalled();

    await tool.execute("call-2", {
      title: "Square",
      prompt: "A square",
      model: "model-b",
    }, new AbortController().signal);
    expect(submitImageJob).toHaveBeenCalledWith(expect.objectContaining({ model: "model-b" }));
  });
});
