import { describe, expect, it, beforeEach } from "vitest";

import type { ImageProvider } from "../src/generation/types.js";
import { registerImageProvider, clearProviders } from "../src/generation/providers/registry.js";
import { runImageGenerate } from "../src/agent/tools/image-generate.js";

const TEST_MODEL_ID = "google/nano-banana-pro";

function createMockProvider(overrides?: Partial<ImageProvider>): ImageProvider {
  return {
    name: "replicate",
    models: [{ id: TEST_MODEL_ID, displayName: "Nano Banana Pro", description: "test" }],
    generate: async () => ({
      url: "https://example.com/img.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
    }),
    ...overrides,
  };
}

describe("generate_image tool", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("returns structured result on success", async () => {
    registerImageProvider(createMockProvider());

    const result = await runImageGenerate({
      title: "A cute cat",
      prompt: "a cat",
      model: TEST_MODEL_ID,
      aspectRatio: "1:1",
      placementWidth: 512,
      placementHeight: 512,
    });

    expect(result.summary).toContain("Generated image");
    expect(result.title).toBe("A cute cat");
    expect(result.imageUrl).toBe("https://example.com/img.png");
    expect(result.width).toBe(1024);
  });

  it("returns error message on generation failure", async () => {
    registerImageProvider(
      createMockProvider({
        generate: async () => {
          throw new Error("API down");
        },
      }),
    );

    const result = await runImageGenerate({
      title: "Test image",
      prompt: "test",
      model: TEST_MODEL_ID,
      aspectRatio: "1:1",
      placementWidth: 512,
      placementHeight: 512,
    });

    expect(result.summary).toContain("failed");
    expect(result.error).toBe("API down");
  });
});

describe("generate_image tool with submitAndAwaitJob", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("returns real result when job succeeds", async () => {
    const submitAndAwaitJob = async () => ({
      jobId: "job-123",
      imageUrl: "https://storage.example.com/signed-url.png",
      width: 1024,
      height: 1024,
      mimeType: "image/png",
    });

    const result = await runImageGenerate(
      {
        title: "A cute cat",
        prompt: "a cat",
        model: TEST_MODEL_ID,
        aspectRatio: "1:1",
        placementWidth: 512,
        placementHeight: 512,
      },
      undefined,
      submitAndAwaitJob,
    );

    expect(result.imageUrl).toBe("https://storage.example.com/signed-url.png");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.error).toBeUndefined();
    expect(result.summary).toContain("Generated image");
  });

  it("returns error when job fails", async () => {
    const submitAndAwaitJob = async () => ({
      jobId: "job-456",
      error: "Model overloaded",
    });

    const result = await runImageGenerate(
      {
        title: "Test",
        prompt: "test",
        model: TEST_MODEL_ID,
        aspectRatio: "1:1",
        placementWidth: 512,
        placementHeight: 512,
      },
      undefined,
      submitAndAwaitJob,
    );

    expect(result.error).toBe("Model overloaded");
    expect(result.summary).toContain("failed");
  });

  it("includes placement when coordinates provided", async () => {
    const submitAndAwaitJob = async () => ({
      jobId: "job-789",
      imageUrl: "https://storage.example.com/img.png",
      width: 512,
      height: 512,
      mimeType: "image/png",
    });

    const result = await runImageGenerate(
      {
        title: "Placed image",
        prompt: "test",
        model: TEST_MODEL_ID,
        aspectRatio: "1:1",
        placementX: 100,
        placementY: 200,
        placementWidth: 300,
        placementHeight: 400,
      },
      undefined,
      submitAndAwaitJob,
    );

    expect(result.placement).toEqual({ x: 100, y: 200, width: 300, height: 400 });
  });
});

describe("generate_image tool with assetId resolution", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("resolves assetId references to base64 data URIs from attachment map", async () => {
    let capturedInputImages: string[] | undefined;
    registerImageProvider(
      createMockProvider({
        generate: async (params) => {
          capturedInputImages = params.inputImages;
          return {
            url: "https://example.com/result.png",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          };
        },
      }),
    );

    const attachmentMap = {
      "asset-001": "data:image/png;base64,iVBORw0KGgo=",
      "asset-002": "data:image/jpeg;base64,/9j/4AAQ=",
    };

    const result = await runImageGenerate(
      {
        title: "Test",
        prompt: "test with reference",
        model: TEST_MODEL_ID,
        inputImages: ["asset-001"],
      },
      undefined,
      undefined,
      attachmentMap,
    );

    expect(result.error).toBeUndefined();
    expect(capturedInputImages).toEqual(["data:image/png;base64,iVBORw0KGgo="]);
  });

  it("passes through non-assetId URLs unchanged", async () => {
    let capturedInputImages: string[] | undefined;
    registerImageProvider(
      createMockProvider({
        generate: async (params) => {
          capturedInputImages = params.inputImages;
          return {
            url: "https://example.com/result.png",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          };
        },
      }),
    );

    const result = await runImageGenerate(
      {
        title: "Test",
        prompt: "test with external url",
        model: TEST_MODEL_ID,
        inputImages: ["https://example.com/external.png"],
      },
      undefined,
      undefined,
      {},
    );

    expect(result.error).toBeUndefined();
    expect(capturedInputImages).toEqual(["https://example.com/external.png"]);
  });

  it("resolves mixed assetIds and URLs", async () => {
    let capturedInputImages: string[] | undefined;
    registerImageProvider(
      createMockProvider({
        generate: async (params) => {
          capturedInputImages = params.inputImages;
          return {
            url: "https://example.com/result.png",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          };
        },
      }),
    );

    const attachmentMap = {
      "asset-001": "data:image/png;base64,abc123",
    };

    const result = await runImageGenerate(
      {
        title: "Test",
        prompt: "mixed references",
        model: TEST_MODEL_ID,
        inputImages: ["asset-001", "https://external.com/img.jpg"],
      },
      undefined,
      undefined,
      attachmentMap,
    );

    expect(result.error).toBeUndefined();
    expect(capturedInputImages).toEqual([
      "data:image/png;base64,abc123",
      "https://external.com/img.jpg",
    ]);
  });
});
