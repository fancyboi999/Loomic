const DEFAULT_SERVER_PORT = "3001";

export const DEFAULT_SERVER_BASE_URL = `http://127.0.0.1:${DEFAULT_SERVER_PORT}`;

export type DesktopRuntime = Readonly<{
  appVersion: string;
  platform: NodeJS.Platform;
  serverBaseUrl: string;
}>;

export type DesktopRuntimeOptions = Readonly<{
  appVersion?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  platform?: NodeJS.Platform;
}>;

export function resolveServerBaseUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const explicitBaseUrl = env.LOOMIC_SERVER_BASE_URL?.trim();

  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  const port = env.LOOMIC_SERVER_PORT?.trim() || DEFAULT_SERVER_PORT;
  return `http://127.0.0.1:${port}`;
}

export function createDesktopRuntime(
  options: DesktopRuntimeOptions = {},
): DesktopRuntime {
  return Object.freeze({
    appVersion: options.appVersion ?? "0.0.0",
    platform: options.platform ?? process.platform,
    serverBaseUrl: resolveServerBaseUrl(options.env),
  });
}
