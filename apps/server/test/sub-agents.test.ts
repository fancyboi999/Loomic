import { describe, expect, it } from "vitest";
import { createImageSubAgent, createVideoSubAgent } from "../src/agent/sub-agents.js";

describe("sub-agent definitions", () => {
  it("createImageSubAgent returns a valid SubAgent shape", () => {
    const subAgent = createImageSubAgent();
    expect(subAgent.name).toBe("image_generate");
    expect(subAgent.description).toBeTruthy();
    expect(subAgent.systemPrompt).toContain("image");
    expect(subAgent.tools).toHaveLength(1);
    expect(subAgent.responseFormat).toBeDefined();
  });

  it("createVideoSubAgent returns a valid SubAgent shape", () => {
    const subAgent = createVideoSubAgent();
    expect(subAgent.name).toBe("video_generate");
    expect(subAgent.description).toBeTruthy();
    expect(subAgent.systemPrompt).toContain("video");
    expect(subAgent.tools).toHaveLength(1);
  });

  it("image sub-agent tool is named generate_image", () => {
    const subAgent = createImageSubAgent();
    expect(subAgent.tools![0]!.name).toBe("generate_image");
  });
});
