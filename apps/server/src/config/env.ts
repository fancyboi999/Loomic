import { readFileSync } from "node:fs";

export const DEFAULT_AGENT_BACKEND_MODE = "state";
export const DEFAULT_AGENT_MODEL = "gpt-5.4-mini";
export const DEFAULT_SERVER_PORT = 3001;
export const DEFAULT_WEB_ORIGIN = "http://localhost:3000";

export type AgentBackendMode = "filesystem" | "state";

export type ServerEnv = {
  agentBackendMode: AgentBackendMode;
  agentFilesRoot?: string;
  agentModel: string;
  googleFontsApiKey?: string;
  openAIApiBase?: string;
  openAIApiKey?: string;
  port: number;
  replicateApiToken?: string;
  supabaseAnonKey?: string;
  supabaseDbUrl?: string;
  supabaseJwtSecret?: string;
  supabaseProjectId?: string;
  supabaseServiceRoleKey?: string;
  supabaseUrl?: string;
  version: string;
  volcesApiKey?: string;
  volcesBaseUrl?: string;
  webOrigin: string;
  workerConcurrency?: number;
  workerId?: string;
  workerPollIntervalMs?: number;
  workerMaxBatchSize?: number;
};

export function loadServerEnv(
  overrides: Partial<ServerEnv> = {},
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const agentFilesRoot =
    overrides.agentFilesRoot ??
    parseAgentFilesRoot(source.LOOMIC_AGENT_FILES_ROOT);
  const openAIApiBase =
    overrides.openAIApiBase ?? normalizeOptionalString(source.OPENAI_API_BASE);
  const openAIApiKey =
    overrides.openAIApiKey ?? normalizeOptionalString(source.OPENAI_API_KEY);
  const supabaseUrl =
    overrides.supabaseUrl ?? normalizeOptionalString(source.SUPABASE_URL);
  const supabaseAnonKey =
    overrides.supabaseAnonKey ??
    normalizeOptionalString(source.SUPABASE_ANON_KEY);
  const supabaseDbUrl =
    overrides.supabaseDbUrl ?? normalizeOptionalString(source.SUPABASE_DB_URL);
  const supabaseJwtSecret =
    overrides.supabaseJwtSecret ?? normalizeOptionalString(source.SUPABASE_JWT_SECRET);
  const supabaseServiceRoleKey =
    overrides.supabaseServiceRoleKey ??
    normalizeOptionalString(source.SUPABASE_SERVICE_ROLE_KEY);
  const supabaseProjectId =
    overrides.supabaseProjectId ??
    normalizeOptionalString(source.SUPABASE_PROJECT_ID);
  const googleFontsApiKey =
    overrides.googleFontsApiKey ?? normalizeOptionalString(source.GOOGLE_FONTS_API_KEY);
  const replicateApiToken =
    overrides.replicateApiToken ?? normalizeOptionalString(source.REPLICATE_API_TOKEN);
  const volcesApiKey =
    overrides.volcesApiKey ?? normalizeOptionalString(source.VOLCES_API_KEY);
  const volcesBaseUrl =
    overrides.volcesBaseUrl ?? normalizeOptionalString(source.VOLCES_BASE_URL);
  const workerConcurrency = overrides.workerConcurrency ??
    (source.WORKER_CONCURRENCY
      ? parseInt(source.WORKER_CONCURRENCY, 10) : undefined);
  const workerId = overrides.workerId ??
    normalizeOptionalString(source.WORKER_ID);
  const workerPollIntervalMs = overrides.workerPollIntervalMs ??
    (source.WORKER_POLL_INTERVAL_MS
      ? parseInt(source.WORKER_POLL_INTERVAL_MS, 10) : undefined);
  const workerMaxBatchSize = overrides.workerMaxBatchSize ??
    (source.WORKER_MAX_BATCH_SIZE
      ? parseInt(source.WORKER_MAX_BATCH_SIZE, 10) : undefined);

  return {
    agentBackendMode:
      overrides.agentBackendMode ??
      parseAgentBackendMode(source.LOOMIC_AGENT_BACKEND_MODE),
    agentModel:
      overrides.agentModel ??
      parseAgentModel(source.LOOMIC_AGENT_MODEL) ??
      DEFAULT_AGENT_MODEL,
    port: overrides.port ?? parsePort(source.LOOMIC_SERVER_PORT ?? source.PORT),
    version: overrides.version ?? readServerVersion(),
    webOrigin:
      overrides.webOrigin ?? source.LOOMIC_WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN,
    ...(agentFilesRoot ? { agentFilesRoot } : {}),
    ...(openAIApiBase ? { openAIApiBase } : {}),
    ...(openAIApiKey ? { openAIApiKey } : {}),
    ...(supabaseUrl ? { supabaseUrl } : {}),
    ...(supabaseAnonKey ? { supabaseAnonKey } : {}),
    ...(supabaseDbUrl ? { supabaseDbUrl } : {}),
    ...(supabaseJwtSecret ? { supabaseJwtSecret } : {}),
    ...(supabaseServiceRoleKey ? { supabaseServiceRoleKey } : {}),
    ...(supabaseProjectId ? { supabaseProjectId } : {}),
    ...(googleFontsApiKey ? { googleFontsApiKey } : {}),
    ...(replicateApiToken ? { replicateApiToken } : {}),
    ...(volcesApiKey ? { volcesApiKey } : {}),
    ...(volcesBaseUrl ? { volcesBaseUrl } : {}),
    ...(workerConcurrency ? { workerConcurrency } : {}),
    ...(workerId ? { workerId } : {}),
    ...(workerPollIntervalMs ? { workerPollIntervalMs } : {}),
    ...(workerMaxBatchSize ? { workerMaxBatchSize } : {}),
  };
}

function parseAgentBackendMode(rawMode: string | undefined): AgentBackendMode {
  if (!rawMode) {
    return DEFAULT_AGENT_BACKEND_MODE;
  }

  if (rawMode === "state" || rawMode === "filesystem") {
    return rawMode;
  }

  throw new Error(`Invalid LOOMIC_AGENT_BACKEND_MODE value: ${rawMode}`);
}

function parseAgentFilesRoot(rawRoot: string | undefined) {
  return normalizeOptionalString(rawRoot);
}

function parseAgentModel(rawModel: string | undefined) {
  return normalizeOptionalString(rawModel);
}

function normalizeOptionalString(value: string | undefined) {
  const normalizedValue = value?.trim();
  return normalizedValue || undefined;
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
