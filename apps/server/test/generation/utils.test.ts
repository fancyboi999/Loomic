import { describe, expect, it } from "vitest";

import {
  aspectRatioToDimensions,
  GenerationError,
} from "../../src/generation/utils.js";

describe("aspectRatioToDimensions", () => {
  it("returns 1024x1024 for 1:1", () => {
    expect(aspectRatioToDimensions("1:1")).toEqual({ width: 1024, height: 1024 });
  });

  it("returns 1024x576 for 16:9", () => {
    expect(aspectRatioToDimensions("16:9")).toEqual({ width: 1024, height: 576 });
  });

  it("returns 576x1024 for 9:16", () => {
    expect(aspectRatioToDimensions("9:16")).toEqual({ width: 576, height: 1024 });
  });

  it("returns 1024x768 for 4:3", () => {
    expect(aspectRatioToDimensions("4:3")).toEqual({ width: 1024, height: 768 });
  });

  it("returns 768x1024 for 3:4", () => {
    expect(aspectRatioToDimensions("3:4")).toEqual({ width: 768, height: 1024 });
  });

  it("rounds to nearest 64 for custom ratios", () => {
    const result = aspectRatioToDimensions("3:2");
    expect(result.width % 64).toBe(0);
    expect(result.height % 64).toBe(0);
  });

  it("uses custom base size", () => {
    const result = aspectRatioToDimensions("1:1", 512);
    expect(result).toEqual({ width: 512, height: 512 });
  });
});

describe("GenerationError", () => {
  it("captures provider and code", () => {
    const err = new GenerationError("openai", "rate_limited", "Rate limit exceeded");
    expect(err.provider).toBe("openai");
    expect(err.code).toBe("rate_limited");
    expect(err.message).toBe("Rate limit exceeded");
    expect(err.name).toBe("GenerationError");
  });
});
