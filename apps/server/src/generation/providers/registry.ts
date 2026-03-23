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
