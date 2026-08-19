import { describe, expect, it } from "vitest";

import { getVideoCreditCost } from "./credits.js";

describe("getVideoCreditCost", () => {
  it("preserves base-plus-duration pricing for existing models", () => {
    expect(getVideoCreditCost("kwaivgi/kling-v2.6", 5, "720p")).toBe(25);
    expect(getVideoCreditCost("kwaivgi/kling-v2.6", 8, "720p")).toBe(40);
    expect(
      getVideoCreditCost("google-vertex/veo-3.1-generate-001", 6, "1080p"),
    ).toBe(190);
  });

  it.each([
    [4, "720p", 41],
    [5, "720p", 51],
    [15, "720p", 153],
    [4, "1080p", 68],
    [5, "1080p", 85],
    [15, "1080p", 255],
  ] as const)(
    "charges Metaso H3 points for %ss at %s and rounds up to %s credits",
    (duration, resolution, expected) => {
      expect(
        getVideoCreditCost("metaso/minimax-h3", duration, resolution),
      ).toBe(expected);
    },
  );

  it("rejects unpriced Metaso resolutions", () => {
    expect(() => getVideoCreditCost("metaso/minimax-h3", 5, "4k")).toThrow(
      "No credit rate configured",
    );
  });

  it("rejects invalid duration values", () => {
    expect(() => getVideoCreditCost("metaso/minimax-h3", 0)).toThrow(
      "positive integer",
    );
    expect(() => getVideoCreditCost("metaso/minimax-h3", 4.5)).toThrow(
      "positive integer",
    );
  });

  it("retains the default fallback for unknown models", () => {
    expect(getVideoCreditCost("unknown/model", 5, "720p")).toBe(80);
  });
});
