import type { GeneratedVideo, VideoGenerateParams } from "./types.js";
import { getVideoProvider } from "./providers/registry.js";

export async function generateVideo(
  providerName: string,
  params: VideoGenerateParams,
): Promise<GeneratedVideo> {
  const provider = getVideoProvider(providerName);
  return provider.generate(params);
}
