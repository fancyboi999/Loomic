import type { ImageProvider, ModelInfo, VideoProvider } from "../types.js";
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

/** Model info enriched with its owning provider name. */
export interface AvailableModel extends ModelInfo {
  provider: string;
}

/** Returns all image models from all registered providers. */
export function getAvailableImageModels(): AvailableModel[] {
  return [...imageProviders.values()].flatMap((p) =>
    p.models.map((m) => ({ ...m, provider: p.name })),
  );
}

/** Returns all video models from all registered providers. */
export function getAvailableVideoModels(): AvailableModel[] {
  return [...videoProviders.values()].flatMap((p) =>
    p.models.map((m) => ({ ...m, provider: p.name })),
  );
}

/** Resolves the provider name that handles a given image model ID. */
export function resolveImageProviderName(modelId: string): string {
  for (const provider of imageProviders.values()) {
    if (provider.models.some((m) => m.id === modelId)) {
      return provider.name;
    }
  }
  throw new GenerationError(
    "unknown",
    "model_not_found",
    `No provider registered for image model: ${modelId}`,
  );
}

/** Resolves the provider name that handles a given video model ID. */
export function resolveVideoProviderName(modelId: string): string {
  for (const provider of videoProviders.values()) {
    if (provider.models.some((m) => m.id === modelId)) {
      return provider.name;
    }
  }
  throw new GenerationError(
    "unknown",
    "model_not_found",
    `No provider registered for video model: ${modelId}`,
  );
}

export function clearProviders(): void {
  imageProviders.clear();
  videoProviders.clear();
}
