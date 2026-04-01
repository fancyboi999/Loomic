/**
 * Centralized provider registration.
 *
 * Both the HTTP server (app.ts) and the background worker (worker.ts) need the
 * same set of image/video generation providers. This module is the single
 * source of truth so that adding a new provider only requires a change here.
 */
import type { ServerEnv } from "../../config/env.js";
import { GoogleImageProvider } from "./google-image.js";
import { GoogleVideoProvider } from "./google-video.js";
import { OpenAIImageProvider } from "./openai-image.js";
import { registerImageProvider, registerVideoProvider } from "./registry.js";
import { ReplicateImageProvider } from "./replicate-image.js";
import { ReplicateVideoProvider } from "./replicate-video.js";
import { VolcesImageProvider } from "./volces-image.js";

/**
 * Register all available generation providers based on the provided env config.
 *
 * Each provider is only registered when its required API key is present,
 * keeping the behaviour identical to the previous inline registration while
 * ensuring every process gets the full set.
 */
export function registerAllProviders(env: ServerEnv): void {
  // Replicate — image + video
  if (env.replicateApiToken) {
    registerImageProvider(new ReplicateImageProvider(env.replicateApiToken));
    registerVideoProvider(new ReplicateVideoProvider(env.replicateApiToken));
  }

  // Google — image + video
  if (env.googleApiKey) {
    registerImageProvider(new GoogleImageProvider(env.googleApiKey));
    registerVideoProvider(new GoogleVideoProvider(env.googleApiKey));
  }

  // OpenAI — image only
  if (env.openAIApiKey) {
    registerImageProvider(
      new OpenAIImageProvider(env.openAIApiKey, env.openAIApiBase),
    );
  }

  // Volces — image only
  if (env.volcesApiKey) {
    registerImageProvider(
      new VolcesImageProvider(env.volcesApiKey, env.volcesBaseUrl),
    );
  }
}
