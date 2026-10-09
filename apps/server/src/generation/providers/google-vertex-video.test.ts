import { describe, expect, it, vi } from "vitest";

import { GoogleVertexVideoProvider } from "./google-vertex-video.js";

describe("GoogleVertexVideoProvider errors", () => {
  it("marks unavailable models as non-retryable", async () => {
    const provider = new GoogleVertexVideoProvider({ project: "test", location: "us-central1" });
    (provider as any).client = {
      models: { generateVideos: vi.fn().mockRejectedValue({ status: 404, message: "NOT_FOUND" }) },
    };

    await expect(provider.generate({
      model: "google-vertex/veo-2.0-generate-001",
      prompt: "A ball rolls across a table",
    })).rejects.toMatchObject({ code: "model_not_found" });
  });
});
