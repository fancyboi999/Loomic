# Image & Video Generation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image and video generation capabilities to Loomic's server with pluggable providers (OpenAI, Replicate, Volcengine) registered as DeepAgents tools.

**Architecture:** Provider abstraction layer → generation core → agent tools. Each provider is a standalone module implementing a common interface. Tools delegate to providers and return structured results for the agent.

**Tech Stack:** TypeScript, Zod, `@langchain/core`, DeepAgents, `openai` SDK.

---

### Task 1: Create shared generation types and utility functions

**Files:**
- Create: `apps/server/src/generation/types.ts`
- Create: `apps/server/src/generation/utils.ts`
- Create: `apps/server/test/generation/utils.test.ts`

- [ ] **Step 1: Write the failing utility test**

Create `apps/server/test/generation/utils.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @loomic/server test -- generation/utils`

Expected: FAIL — modules not found.

- [ ] **Step 3: Create types module**

Create `apps/server/src/generation/types.ts`:
```typescript
export interface ImageGenerateParams {
  prompt: string;
  model: string;
  aspectRatio?: string;
  inputImages?: string[];
  metadata?: Record<string, unknown>;
}

export interface GeneratedImage {
  url: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface ImageProvider {
  readonly name: string;
  generate(params: ImageGenerateParams): Promise<GeneratedImage>;
}

export interface VideoGenerateParams {
  prompt: string;
  model: string;
  resolution?: "480p" | "720p" | "1080p";
  duration?: 5 | 10;
  aspectRatio?: string;
  inputImages?: string[];
}

export interface GeneratedVideo {
  url: string;
  mimeType: string;
  width: number;
  height: number;
  durationSeconds: number;
}

export interface VideoProvider {
  readonly name: string;
  generate(params: VideoGenerateParams): Promise<GeneratedVideo>;
}
```

- [ ] **Step 4: Create utils module**

Create `apps/server/src/generation/utils.ts`:
```typescript
const KNOWN_RATIOS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1024, height: 576 },
  "9:16": { width: 576, height: 1024 },
  "4:3": { width: 1024, height: 768 },
  "3:4": { width: 768, height: 1024 },
};

function roundTo64(value: number): number {
  return Math.round(value / 64) * 64;
}

export function aspectRatioToDimensions(
  aspectRatio: string,
  baseSize = 1024,
): { width: number; height: number } {
  const known = KNOWN_RATIOS[aspectRatio];
  if (known && baseSize === 1024) return known;

  const [wStr, hStr] = aspectRatio.split(":");
  const w = Number(wStr);
  const h = Number(hStr);
  if (!w || !h) return { width: baseSize, height: baseSize };

  const ratio = w / h;
  if (ratio >= 1) {
    return { width: roundTo64(baseSize), height: roundTo64(baseSize / ratio) };
  }
  return { width: roundTo64(baseSize * ratio), height: roundTo64(baseSize) };
}

export class GenerationError extends Error {
  constructor(
    public readonly provider: string,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @loomic/server test -- generation/utils`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/generation/ apps/server/test/generation/
git commit -m "feat: add image/video generation types and utility functions"
```

---

### Task 2: Create provider registry and OpenAI image provider

**Files:**
- Create: `apps/server/src/generation/providers/registry.ts`
- Create: `apps/server/src/generation/providers/openai-image.ts`
- Create: `apps/server/test/generation/registry.test.ts`
- Create: `apps/server/test/generation/openai-image.test.ts`

- [ ] **Step 1: Write the failing registry test**

Create `apps/server/test/generation/registry.test.ts`:
```typescript
import { describe, expect, it, beforeEach } from "vitest";

import type { ImageProvider } from "../../src/generation/types.js";
import {
  registerImageProvider,
  getImageProvider,
  clearProviders,
} from "../../src/generation/providers/registry.js";

describe("Provider registry", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("registers and retrieves an image provider", () => {
    const mockProvider: ImageProvider = {
      name: "test",
      generate: async () => ({ url: "http://x", mimeType: "image/png", width: 100, height: 100 }),
    };
    registerImageProvider(mockProvider);
    expect(getImageProvider("test")).toBe(mockProvider);
  });

  it("throws for unknown provider", () => {
    expect(() => getImageProvider("nope")).toThrow(/no image provider.*nope/i);
  });
});
```

- [ ] **Step 2: Write the failing OpenAI provider test**

Create `apps/server/test/generation/openai-image.test.ts`:
```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

import { OpenAIImageProvider } from "../../src/generation/providers/openai-image.js";
import type { ImageGenerateParams } from "../../src/generation/types.js";

// Mock the openai SDK
vi.mock("openai", () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      images: { generate: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

import { __mockCreate } from "openai";

describe("OpenAIImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls OpenAI images.generate with correct params", async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ url: "https://oai.example.com/img.png" }],
    });

    const provider = new OpenAIImageProvider("test-key");
    const params: ImageGenerateParams = {
      prompt: "a cat",
      model: "gpt-image-1",
      aspectRatio: "1:1",
    };

    const result = await provider.generate(params);

    expect(result.url).toBe("https://oai.example.com/img.png");
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });

  it("maps aspect ratio to size string", async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ url: "https://oai.example.com/img.png" }],
    });

    const provider = new OpenAIImageProvider("test-key");
    await provider.generate({
      prompt: "wide landscape",
      model: "gpt-image-1",
      aspectRatio: "16:9",
    });

    expect((__mockCreate as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({ size: "1024x576" }),
    );
  });

  it("throws GenerationError on API failure", async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("API rate limit"),
    );

    const provider = new OpenAIImageProvider("test-key");
    await expect(
      provider.generate({ prompt: "test", model: "gpt-image-1" }),
    ).rejects.toThrow("API rate limit");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @loomic/server test -- generation/registry generation/openai`

Expected: FAIL.

- [ ] **Step 4: Create registry module**

Create `apps/server/src/generation/providers/registry.ts`:
```typescript
import type { ImageProvider, VideoProvider } from "../types.js";
import { GenerationError } from "../utils.js";

const imageProviders = new Map<string, ImageProvider>();
const videoProviders = new Map<string, VideoProvider>();

export function registerImageProvider(provider: ImageProvider): void {
  imageProviders.set(provider.name, provider);
}

export function registerVideoProvider(provider: VideoProvider): void {
  videoProviders.set(provider.name, provider);
}

export function getImageProvider(name: string): ImageProvider {
  const provider = imageProviders.get(name);
  if (!provider) {
    throw new GenerationError(name, "provider_not_found", `No image provider registered: ${name}`);
  }
  return provider;
}

export function getVideoProvider(name: string): VideoProvider {
  const provider = videoProviders.get(name);
  if (!provider) {
    throw new GenerationError(name, "provider_not_found", `No video provider registered: ${name}`);
  }
  return provider;
}

export function clearProviders(): void {
  imageProviders.clear();
  videoProviders.clear();
}
```

- [ ] **Step 5: Create OpenAI image provider**

Create `apps/server/src/generation/providers/openai-image.ts`:
```typescript
import OpenAI from "openai";

import type { GeneratedImage, ImageGenerateParams, ImageProvider } from "../types.js";
import { aspectRatioToDimensions, GenerationError } from "../utils.js";

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const { width, height } = aspectRatioToDimensions(params.aspectRatio ?? "1:1");
    const size = `${width}x${height}` as `${number}x${number}`;

    try {
      const response = await this.client.images.generate({
        model: params.model,
        prompt: params.prompt,
        size,
        n: 1,
      });

      const url = response.data[0]?.url;
      if (!url) {
        throw new GenerationError("openai", "no_output", "OpenAI returned no image URL");
      }

      return { url, mimeType: "image/png", width, height };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError(
        "openai",
        "api_error",
        error instanceof Error ? error.message : "Unknown OpenAI error",
      );
    }
  }
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @loomic/server test -- generation/`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/generation/providers/ apps/server/test/generation/
git commit -m "feat: add provider registry and OpenAI image provider"
```

---

### Task 3: Create Replicate image provider

**Files:**
- Create: `apps/server/src/generation/providers/replicate-image.ts`
- Create: `apps/server/test/generation/replicate-image.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/generation/replicate-image.test.ts`:
```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ReplicateImageProvider } from "../../src/generation/providers/replicate-image.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("ReplicateImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends correct request to Replicate API", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: ["https://replicate.delivery/image.png"],
        status: "succeeded",
      }),
    });

    const provider = new ReplicateImageProvider("rep-token");
    const result = await provider.generate({
      prompt: "a sunset",
      model: "black-forest-labs/flux-schnell",
      aspectRatio: "16:9",
    });

    expect(result.url).toBe("https://replicate.delivery/image.png");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer rep-token",
          Prefer: "wait",
        }),
      }),
    );
  });

  it("throws GenerationError on API failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Invalid model" }),
    });

    const provider = new ReplicateImageProvider("rep-token");
    await expect(
      provider.generate({ prompt: "test", model: "bad/model" }),
    ).rejects.toThrow(/replicate/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @loomic/server test -- generation/replicate`

Expected: FAIL.

- [ ] **Step 3: Create Replicate provider**

Create `apps/server/src/generation/providers/replicate-image.ts`:
```typescript
import type { GeneratedImage, ImageGenerateParams, ImageProvider } from "../types.js";
import { aspectRatioToDimensions, GenerationError } from "../utils.js";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

export class ReplicateImageProvider implements ImageProvider {
  readonly name = "replicate";
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const { width, height } = aspectRatioToDimensions(params.aspectRatio ?? "1:1");

    const body: Record<string, unknown> = {
      input: {
        prompt: params.prompt,
        width,
        height,
        ...(params.inputImages?.length ? { image: params.inputImages[0] } : {}),
      },
    };

    const response = await fetch(
      `${REPLICATE_API_BASE}/models/${params.model}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new GenerationError(
        "replicate",
        "api_error",
        `Replicate API error ${response.status}: ${errorBody?.detail ?? "Unknown error"}`,
      );
    }

    const data = (await response.json()) as { output: string[] | string; status: string };
    const outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;

    if (!outputUrl) {
      throw new GenerationError("replicate", "no_output", "Replicate returned no output URL");
    }

    return { url: outputUrl, mimeType: "image/png", width, height };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @loomic/server test -- generation/`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/generation/providers/replicate-image.ts apps/server/test/generation/replicate-image.test.ts
git commit -m "feat: add Replicate image provider"
```

---

### Task 4: Create Volcengine image and video providers

**Files:**
- Create: `apps/server/src/generation/providers/volces-image.ts`
- Create: `apps/server/src/generation/providers/volces-video.ts`
- Create: `apps/server/test/generation/volces-image.test.ts`
- Create: `apps/server/test/generation/volces-video.test.ts`

- [ ] **Step 1: Write the failing Volces image test**

Create `apps/server/test/generation/volces-image.test.ts`:
```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

import { VolcesImageProvider } from "../../src/generation/providers/volces-image.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("VolcesImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends OpenAI-compatible request with dimensions", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ url: "https://volces.example.com/img.png" }],
      }),
    });

    const provider = new VolcesImageProvider("volces-key");
    const result = await provider.generate({
      prompt: "a mountain",
      model: "doubao-seedream-3-0",
      aspectRatio: "4:3",
    });

    expect(result.url).toBe("https://volces.example.com/img.png");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
  });

  it("throws GenerationError on failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Bad request" } }),
    });

    const provider = new VolcesImageProvider("volces-key");
    await expect(
      provider.generate({ prompt: "test", model: "bad-model" }),
    ).rejects.toThrow(/volces/i);
  });
});
```

- [ ] **Step 2: Write the failing Volces video test**

Create `apps/server/test/generation/volces-video.test.ts`:
```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

import { VolcesVideoProvider } from "../../src/generation/providers/volces-video.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("VolcesVideoProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends video generation request", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ url: "https://volces.example.com/video.mp4" }],
      }),
    });

    const provider = new VolcesVideoProvider("volces-key");
    const result = await provider.generate({
      prompt: "a bird flying",
      model: "doubao-seedance-1-0",
      resolution: "720p",
      duration: 5,
    });

    expect(result.url).toBe("https://volces.example.com/video.mp4");
    expect(result.mimeType).toBe("video/mp4");
    expect(result.durationSeconds).toBe(5);
  });

  it("throws GenerationError on failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Internal error" } }),
    });

    const provider = new VolcesVideoProvider("volces-key");
    await expect(
      provider.generate({ prompt: "test", model: "m", duration: 5 }),
    ).rejects.toThrow(/volces/i);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @loomic/server test -- generation/volces`

Expected: FAIL.

- [ ] **Step 4: Create Volces image provider**

Create `apps/server/src/generation/providers/volces-image.ts`:
```typescript
import type { GeneratedImage, ImageGenerateParams, ImageProvider } from "../types.js";
import { aspectRatioToDimensions, GenerationError } from "../utils.js";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export class VolcesImageProvider implements ImageProvider {
  readonly name = "volces";
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.baseURL = baseURL ?? DEFAULT_BASE_URL;
  }

  async generate(params: ImageGenerateParams): Promise<GeneratedImage> {
    const { width, height } = aspectRatioToDimensions(params.aspectRatio ?? "1:1");

    const body = {
      model: params.model,
      prompt: params.prompt,
      size: `${width}x${height}`,
      n: 1,
    };

    const response = await fetch(`${this.baseURL}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new GenerationError(
        "volces",
        "api_error",
        `Volces API error ${response.status}: ${errorBody?.error?.message ?? "Unknown error"}`,
      );
    }

    const data = (await response.json()) as { data: Array<{ url?: string; b64_json?: string }> };
    const imageData = data.data[0];
    const url = imageData?.url;

    if (!url) {
      throw new GenerationError("volces", "no_output", "Volces returned no image URL");
    }

    return { url, mimeType: "image/png", width, height };
  }
}
```

- [ ] **Step 5: Create Volces video provider**

Create `apps/server/src/generation/providers/volces-video.ts`:
```typescript
import type { GeneratedVideo, VideoGenerateParams, VideoProvider } from "../types.js";
import { GenerationError } from "../utils.js";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

export class VolcesVideoProvider implements VideoProvider {
  readonly name = "volces";
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.baseURL = baseURL ?? DEFAULT_BASE_URL;
  }

  async generate(params: VideoGenerateParams): Promise<GeneratedVideo> {
    const resolution = RESOLUTION_MAP[params.resolution ?? "720p"] ?? RESOLUTION_MAP["720p"];
    const duration = params.duration ?? 5;

    const body = {
      model: params.model,
      prompt: params.prompt,
      size: `${resolution.width}x${resolution.height}`,
      duration,
      ...(params.inputImages?.length ? { image: params.inputImages[0] } : {}),
    };

    const response = await fetch(`${this.baseURL}/video/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new GenerationError(
        "volces",
        "api_error",
        `Volces video API error ${response.status}: ${errorBody?.error?.message ?? "Unknown error"}`,
      );
    }

    const data = (await response.json()) as { data: Array<{ url?: string }> };
    const url = data.data[0]?.url;

    if (!url) {
      throw new GenerationError("volces", "no_output", "Volces returned no video URL");
    }

    return {
      url,
      mimeType: "video/mp4",
      width: resolution.width,
      height: resolution.height,
      durationSeconds: duration,
    };
  }
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @loomic/server test -- generation/`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/generation/providers/volces-*.ts apps/server/test/generation/volces-*.test.ts
git commit -m "feat: add Volcengine image and video providers"
```

---

### Task 5: Create generation orchestrators and env config

**Files:**
- Create: `apps/server/src/generation/image-generation.ts`
- Create: `apps/server/src/generation/video-generation.ts`
- Create: `apps/server/src/generation/index.ts`
- Modify: `apps/server/src/config/env.ts`
- Create: `apps/server/test/generation/image-generation.test.ts`

- [ ] **Step 1: Write the failing image generation test**

Create `apps/server/test/generation/image-generation.test.ts`:
```typescript
import { describe, expect, it, beforeEach } from "vitest";

import type { ImageProvider } from "../../src/generation/types.js";
import { generateImage } from "../../src/generation/image-generation.js";
import { registerImageProvider, clearProviders } from "../../src/generation/providers/registry.js";

describe("generateImage orchestrator", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("delegates to the named provider", async () => {
    const mockProvider: ImageProvider = {
      name: "mock",
      generate: async () => ({
        url: "https://example.com/img.png",
        mimeType: "image/png",
        width: 512,
        height: 512,
      }),
    };
    registerImageProvider(mockProvider);

    const result = await generateImage("mock", { prompt: "test", model: "m" });
    expect(result.url).toBe("https://example.com/img.png");
  });

  it("throws for unknown provider", async () => {
    await expect(
      generateImage("nope", { prompt: "test", model: "m" }),
    ).rejects.toThrow(/no image provider/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @loomic/server test -- generation/image-generation`

Expected: FAIL.

- [ ] **Step 3: Create image generation orchestrator**

Create `apps/server/src/generation/image-generation.ts`:
```typescript
import type { GeneratedImage, ImageGenerateParams } from "./types.js";
import { getImageProvider } from "./providers/registry.js";

export async function generateImage(
  providerName: string,
  params: ImageGenerateParams,
): Promise<GeneratedImage> {
  const provider = getImageProvider(providerName);
  return provider.generate(params);
}
```

- [ ] **Step 4: Create video generation orchestrator**

Create `apps/server/src/generation/video-generation.ts`:
```typescript
import type { GeneratedVideo, VideoGenerateParams } from "./types.js";
import { getVideoProvider } from "./providers/registry.js";

export async function generateVideo(
  providerName: string,
  params: VideoGenerateParams,
): Promise<GeneratedVideo> {
  const provider = getVideoProvider(providerName);
  return provider.generate(params);
}
```

- [ ] **Step 5: Create barrel export**

Create `apps/server/src/generation/index.ts`:
```typescript
export { generateImage } from "./image-generation.js";
export { generateVideo } from "./video-generation.js";
export {
  registerImageProvider,
  registerVideoProvider,
  getImageProvider,
  getVideoProvider,
  clearProviders,
} from "./providers/registry.js";
export { GenerationError, aspectRatioToDimensions } from "./utils.js";
export type {
  ImageProvider,
  VideoProvider,
  ImageGenerateParams,
  VideoGenerateParams,
  GeneratedImage,
  GeneratedVideo,
} from "./types.js";
```

- [ ] **Step 6: Add new env vars to ServerEnv**

Modify `apps/server/src/config/env.ts` — add to `ServerEnv` type:
```typescript
replicateApiToken?: string;
volcesApiKey?: string;
volcesBaseUrl?: string;
```

And in `loadServerEnv`, add parsing for:
- `REPLICATE_API_TOKEN`
- `VOLCES_API_KEY`
- `VOLCES_BASE_URL`

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @loomic/server test`

Expected: ALL PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/generation/ apps/server/src/config/env.ts apps/server/test/generation/
git commit -m "feat: add generation orchestrators and provider env config"
```

---

### Task 6: Create agent tools for image and video generation

**Files:**
- Create: `apps/server/src/agent/tools/image-generate.ts`
- Create: `apps/server/src/agent/tools/video-generate.ts`
- Modify: `apps/server/src/agent/tools/index.ts`
- Create: `apps/server/test/image-generate-tool.test.ts`

- [ ] **Step 1: Write the failing tool test**

Create `apps/server/test/image-generate-tool.test.ts`:
```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ImageProvider } from "../src/generation/types.js";
import { registerImageProvider, clearProviders } from "../src/generation/providers/registry.js";
import { runImageGenerate } from "../src/agent/tools/image-generate.js";

describe("generate_image tool", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("returns structured result on success", async () => {
    const mockProvider: ImageProvider = {
      name: "openai",
      generate: async () => ({
        url: "https://example.com/img.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
      }),
    };
    registerImageProvider(mockProvider);

    const result = await runImageGenerate({
      prompt: "a cat",
      provider: "openai",
      model: "gpt-image-1",
      aspectRatio: "1:1",
    });

    expect(result.summary).toContain("Generated image");
    expect(result.imageUrl).toBe("https://example.com/img.png");
    expect(result.width).toBe(1024);
  });

  it("returns error message on generation failure", async () => {
    const mockProvider: ImageProvider = {
      name: "openai",
      generate: async () => { throw new Error("API down"); },
    };
    registerImageProvider(mockProvider);

    const result = await runImageGenerate({
      prompt: "test",
      provider: "openai",
      model: "m",
    });

    expect(result.summary).toContain("failed");
    expect(result.error).toBe("API down");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @loomic/server test -- image-generate-tool`

Expected: FAIL.

- [ ] **Step 3: Create image generate tool**

Create `apps/server/src/agent/tools/image-generate.ts`:
```typescript
import { tool } from "langchain";
import { z } from "zod";

import { generateImage } from "../../generation/image-generation.js";

const imageGenerateSchema = z.object({
  prompt: z.string().min(1).describe("Detailed image generation prompt"),
  provider: z.string().describe("Provider: openai, replicate, or volces"),
  model: z.string().describe("Model identifier"),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().default("1:1"),
  inputImages: z.array(z.string().url()).optional().describe("Reference images for img2img"),
});

type ImageGenerateInput = z.infer<typeof imageGenerateSchema>;

type ImageGenerateResult = {
  summary: string;
  imageUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  error?: string;
};

export async function runImageGenerate(
  input: ImageGenerateInput,
): Promise<ImageGenerateResult> {
  try {
    const result = await generateImage(input.provider, {
      prompt: input.prompt,
      model: input.model,
      aspectRatio: input.aspectRatio,
      inputImages: input.inputImages,
    });

    return {
      summary: `Generated image (${result.width}x${result.height}) via ${input.provider}/${input.model}`,
      imageUrl: result.url,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      summary: `Image generation failed: ${message}`,
      error: message,
    };
  }
}

export function createImageGenerateTool() {
  return tool(
    async (input) => {
      return await runImageGenerate(input);
    },
    {
      name: "generate_image",
      description:
        "Generate an image using AI. Supports multiple providers (openai, replicate, volces) and models. Returns the generated image URL.",
      schema: imageGenerateSchema,
    },
  );
}
```

- [ ] **Step 4: Create video generate tool**

Create `apps/server/src/agent/tools/video-generate.ts`:
```typescript
import { tool } from "langchain";
import { z } from "zod";

import { generateVideo } from "../../generation/video-generation.js";

const videoGenerateSchema = z.object({
  prompt: z.string().min(1).describe("Detailed video generation prompt"),
  provider: z.string().describe("Provider: volces"),
  model: z.string().describe("Model identifier"),
  resolution: z.enum(["480p", "720p", "1080p"]).optional().default("720p"),
  duration: z.number().int().min(5).max(10).optional().default(5),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().default("16:9"),
  inputImages: z.array(z.string().url()).optional().describe("First frame reference"),
});

type VideoGenerateResult = {
  summary: string;
  videoUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  error?: string;
};

export async function runVideoGenerate(
  input: z.infer<typeof videoGenerateSchema>,
): Promise<VideoGenerateResult> {
  try {
    const result = await generateVideo(input.provider, {
      prompt: input.prompt,
      model: input.model,
      resolution: input.resolution,
      duration: input.duration as 5 | 10,
      aspectRatio: input.aspectRatio,
      inputImages: input.inputImages,
    });

    return {
      summary: `Generated ${result.durationSeconds}s video (${result.width}x${result.height}) via ${input.provider}/${input.model}`,
      videoUrl: result.url,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      durationSeconds: result.durationSeconds,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      summary: `Video generation failed: ${message}`,
      error: message,
    };
  }
}

export function createVideoGenerateTool() {
  return tool(
    async (input) => {
      return await runVideoGenerate(input);
    },
    {
      name: "generate_video",
      description:
        "Generate a video using AI. Currently supports volces provider. Returns the generated video URL.",
      schema: videoGenerateSchema,
    },
  );
}
```

- [ ] **Step 5: Register tools in index.ts**

Modify `apps/server/src/agent/tools/index.ts`:
```typescript
import type { BackendFactory, BackendProtocol } from "deepagents";

import { createImageGenerateTool } from "./image-generate.js";
import { createProjectSearchTool } from "./project-search.js";
import { createVideoGenerateTool } from "./video-generate.js";

export function createPhaseATools(backend: BackendProtocol | BackendFactory) {
  return [
    createProjectSearchTool(backend),
    createImageGenerateTool(),
    createVideoGenerateTool(),
  ] as const;
}
```

- [ ] **Step 6: Run all tests**

Run: `pnpm --filter @loomic/server test`

Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/agent/tools/ apps/server/test/image-generate-tool.test.ts
git commit -m "feat: add image and video generation agent tools"
```

---

### Task 7: Full verification — typecheck, test, build

**Files:**
- None created (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`

Expected: ALL PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `pnpm build`

Expected: ALL packages build.

- [ ] **Step 4: Commit any remaining fixes**

```bash
git status
# Only commit if there are meaningful fixes
```
