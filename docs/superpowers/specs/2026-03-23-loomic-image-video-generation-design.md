# Loomic Image & Video Generation System Design

> **Status:** Approved. Covers the first migration sub-project from Jaaz: porting the provider abstraction layer and generation tools to Loomic's TypeScript architecture.

**Goal:** Add image and video generation capabilities to Loomic's server, providing AI agents with tools to generate creative media via multiple provider APIs (OpenAI, Replicate, Volcengine/Doubao, Wavespeed).

**Architecture:** Provider abstraction pattern with pluggable backends. Each provider implements a common interface. Agent tools call providers via a unified generation core. Generated assets are stored to Supabase Storage and linked to the project's asset_objects table.

**Tech Stack:** TypeScript, Zod (schemas), `@langchain/core` (tool interface), DeepAgents (agent framework), Supabase Storage (asset persistence).

---

## Provider Abstraction

### Interface

Each image provider implements:

```typescript
interface ImageProvider {
  readonly name: string;
  generate(params: ImageGenerateParams): Promise<GeneratedImage>;
}

interface ImageGenerateParams {
  prompt: string;
  model: string;
  aspectRatio?: string;        // "1:1", "16:9", "9:16", "4:3", "3:4"
  inputImages?: string[];      // URLs for image-to-image
  metadata?: Record<string, unknown>;
}

interface GeneratedImage {
  url: string;                 // Temporary URL from provider
  mimeType: string;            // "image/png", "image/webp", etc.
  width: number;
  height: number;
}
```

Video provider interface:

```typescript
interface VideoProvider {
  readonly name: string;
  generate(params: VideoGenerateParams): Promise<GeneratedVideo>;
}

interface VideoGenerateParams {
  prompt: string;
  model: string;
  resolution?: "480p" | "720p" | "1080p";
  duration?: 5 | 10;
  aspectRatio?: string;
  inputImages?: string[];     // First frame reference
}

interface GeneratedVideo {
  url: string;
  mimeType: string;
  width: number;
  height: number;
  durationSeconds: number;
}
```

### Concrete Providers (Phase 1)

1. **OpenAIImageProvider** — `openai` SDK, `images.generate()` / `images.edit()`
2. **ReplicateImageProvider** — REST API, `POST /v1/models/{model}/predictions`
3. **VolcesImageProvider** — OpenAI-compatible endpoint with custom aspect ratio → dimension mapping
4. **VolcesVideoProvider** — OpenAI-compatible video endpoint

**Note:** The `jaaz` provider (Jaaz Cloud API) is excluded — Loomic is the cloud service itself. Image generation happens directly via the SDK providers. The `wavespeed` and `comfyui` providers are deferred to a later sub-project.

### Provider Registry

```typescript
// apps/server/src/generation/providers/registry.ts
const IMAGE_PROVIDERS: Record<string, ImageProvider> = {};
const VIDEO_PROVIDERS: Record<string, VideoProvider> = {};

function registerImageProvider(provider: ImageProvider): void;
function registerVideoProvider(provider: VideoProvider): void;
function getImageProvider(name: string): ImageProvider;
function getVideoProvider(name: string): VideoProvider;
```

Providers are registered at server startup if their required env vars are present (API keys).

### Environment Variables

```
OPENAI_API_KEY          — Already exists for agent LLM
REPLICATE_API_TOKEN     — For Replicate image generation
VOLCES_API_KEY          — For Volcengine/Doubao generation
VOLCES_BASE_URL         — Volcengine endpoint (default: https://ark.cn-beijing.volces.com/api/v3)
```

## Generation Core

```typescript
// apps/server/src/generation/image-generation.ts
export async function generateImage(
  providerName: string,
  params: ImageGenerateParams,
): Promise<GeneratedImage>;

// apps/server/src/generation/video-generation.ts
export async function generateVideo(
  providerName: string,
  params: VideoGenerateParams,
): Promise<GeneratedVideo>;
```

These orchestrator functions:
1. Look up provider from registry
2. Call `provider.generate(params)`
3. Return the result (URL + metadata)

Asset persistence (uploading to Supabase Storage) happens in the tool layer, not the generation core. This keeps the generation core pure and testable.

## Agent Tools

### `generate_image` Tool

```typescript
// apps/server/src/agent/tools/image-generate.ts
const schema = z.object({
  prompt: z.string().min(1).describe("Image generation prompt"),
  provider: z.string().describe("Provider name: openai, replicate, volces"),
  model: z.string().describe("Model identifier"),
  aspectRatio: z.string().optional().default("1:1"),
  inputImages: z.array(z.string().url()).optional(),
});

// Returns { summary, imageUrl, mimeType, width, height }
```

### `generate_video` Tool

```typescript
// apps/server/src/agent/tools/video-generate.ts
const schema = z.object({
  prompt: z.string().min(1),
  provider: z.string(),
  model: z.string(),
  resolution: z.enum(["480p", "720p", "1080p"]).optional().default("720p"),
  duration: z.number().int().min(5).max(10).optional().default(5),
  aspectRatio: z.string().optional().default("16:9"),
  inputImages: z.array(z.string().url()).optional(),
});

// Returns { summary, videoUrl, mimeType, width, height, durationSeconds }
```

Both tools are registered in `createPhaseATools()` alongside the existing `project_search` tool.

## File Structure

```
apps/server/src/
├── generation/
│   ├── types.ts                          ← Shared types (interfaces above)
│   ├── image-generation.ts               ← Image generation orchestrator
│   ├── video-generation.ts               ← Video generation orchestrator
│   └── providers/
│       ├── registry.ts                   ← Provider registry
│       ├── openai-image.ts               ← OpenAI image provider
│       ├── replicate-image.ts            ← Replicate image provider
│       ├── volces-image.ts               ← Volcengine image provider
│       └── volces-video.ts               ← Volcengine video provider
├── agent/
│   └── tools/
│       ├── index.ts                      ← Updated: register new tools
│       ├── project-search.ts             ← Existing
│       ├── image-generate.ts             ← NEW: image generation tool
│       └── video-generate.ts             ← NEW: video generation tool
└── config/
    └── env.ts                            ← Updated: new env vars

apps/server/test/
├── generation/
│   ├── openai-image.test.ts
│   ├── replicate-image.test.ts
│   ├── volces-image.test.ts
│   ├── volces-video.test.ts
│   └── registry.test.ts
└── image-generate-tool.test.ts
```

## Testing Strategy

- **Unit tests per provider:** Mock `fetch` / SDK calls, verify request params and response parsing
- **Registry tests:** Register/get/missing provider behavior
- **Generation core tests:** Provider selection, error propagation
- **Tool integration tests:** Verify Zod schema validation, tool return shape

All tests mock external API calls — no real HTTP requests in CI.

## Aspect Ratio → Dimension Mapping

Shared utility for providers that need pixel dimensions:

```typescript
function aspectRatioToDimensions(
  aspectRatio: string,
  baseSize?: number,  // default 1024
): { width: number; height: number };
```

Mapping: `1:1` → 1024x1024, `16:9` → 1024x576, `9:16` → 576x1024, `4:3` → 1024x768, `3:4` → 768x1024.

Some providers (Volces) require dimensions divisible by 64 — the function rounds accordingly.

## Error Handling

Each provider wraps external API errors into:

```typescript
class GenerationError extends Error {
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

The tool layer catches `GenerationError` and returns a descriptive error message to the agent (not thrown — agent receives text explaining what failed so it can retry or inform user).

## Scope Exclusions

- Asset upload to Supabase Storage (future: after generation, save to project)
- Canvas positioning (future: when canvas UI exists)
- ComfyUI / Wavespeed providers (deferred)
- Jaaz Cloud API provider (Loomic IS the cloud now)
- Tool confirmation UI (future sub-project)
- WebSocket/real-time progress updates during generation (SSE stream events suffice)
- Model auto-discovery / config UI (future: settings sub-project)
