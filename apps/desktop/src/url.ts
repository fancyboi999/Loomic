import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_WEB_DEV_URL = "http://localhost:3000";

export type DesktopContentSource =
  | Readonly<{
      entrypoint: string;
      kind: "file";
      filePath: string;
    }>
  | Readonly<{
      entrypoint: string;
      kind: "url";
    }>;

export type ResolveDesktopContentSourceOptions = Readonly<{
  desktopAppDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  mode?: "development" | "production";
  webExportDir?: string;
}>;

const defaultDesktopAppDir = fileURLToPath(new URL("..", import.meta.url));

export function resolveDesktopContentSource(
  options: ResolveDesktopContentSourceOptions = {},
): DesktopContentSource {
  const env = options.env ?? process.env;
  const mode =
    options.mode ?? (env.NODE_ENV === "production" ? "production" : "development");

  if (mode === "development") {
    const entrypoint = normalizeWebUrl(env.WEB_URL) ?? DEFAULT_WEB_DEV_URL;

    return {
      kind: "url",
      entrypoint,
    };
  }

  const desktopAppDir = options.desktopAppDir ?? defaultDesktopAppDir;
  const webExportDir =
    options.webExportDir ??
    resolveWebExportDir({
      desktopAppDir,
      env,
    });
  const filePath = path.resolve(webExportDir, "index.html");

  return {
    kind: "file",
    entrypoint: pathToFileURL(filePath).toString(),
    filePath,
  };
}

function resolveWebExportDir({
  desktopAppDir,
  env,
}: Readonly<{
  desktopAppDir: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
}>): string {
  const explicitExportDir = env.WEB_EXPORT_DIR?.trim();

  if (explicitExportDir) {
    return path.resolve(explicitExportDir);
  }

  return path.resolve(desktopAppDir, "../web/out");
}

function normalizeWebUrl(value?: string): string | undefined {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return undefined;
  }

  return normalizedValue.endsWith("/")
    ? normalizedValue.slice(0, -1)
    : normalizedValue;
}
