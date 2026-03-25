import { describe, expect, it, beforeEach } from "vitest";

import type { ImageProvider } from "../src/generation/types.js";
import { registerImageProvider, clearProviders } from "../src/generation/providers/registry.js";
import { runImageGenerate } from "../src/agent/tools/image-generate.js";

describe("generate_image tool", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("returns structured result on success", async () => {
    const mockProvider: ImageProvider = {
      name: "replicate",
      generate: async () => ({
        url: "https://example.com/img.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
      }),
    };
    registerImageProvider(mockProvider);

    const result = await runImageGenerate({
      title: "A cute cat",
      prompt: "a cat",
      model: "google/nano-banana-pro",
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
    const mockProvider: ImageProvider = {
      name: "replicate",
      generate: async () => { throw new Error("API down"); },
    };
    registerImageProvider(mockProvider);

    const result = await runImageGenerate({
      title: "Test image",
      prompt: "test",
      model: "google/nano-banana-pro",
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
        model: "google/nano-banana-pro",
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
        model: "google/nano-banana-pro",
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
        model: "google/nano-banana-pro",
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
