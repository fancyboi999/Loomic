import { readFileSync } from "node:fs";

export const DEFAULT_SERVER_PORT = 3001;
export const DEFAULT_WEB_ORIGIN = "http://localhost:3000";

export type ServerEnv = {
  port: number;
  version: string;
  webOrigin: string;
};

export function loadServerEnv(
  overrides: Partial<ServerEnv> = {},
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  return {
    port: overrides.port ?? parsePort(source.LOOMIC_SERVER_PORT),
    version: overrides.version ?? readServerVersion(),
    webOrigin:
      overrides.webOrigin ?? source.LOOMIC_WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN,
  };
}

function parsePort(rawPort: string | undefined) {
  if (!rawPort) {
    return DEFAULT_SERVER_PORT;
  }

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid LOOMIC_SERVER_PORT value: ${rawPort}`);
  }

  return port;
}

function readServerVersion() {
  const packageJson = readFileSync(
    new URL("../../package.json", import.meta.url),
    "utf8",
  );

  const parsed = JSON.parse(packageJson) as { version?: string };
  return parsed.version ?? "0.0.0";
}
