const defaultServerBaseUrl = "http://localhost:3001";

export function getServerBaseUrl() {
  return resolveServerBaseUrl(process.env);
}

export type WebEnv = {
  serverBaseUrl: string;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export function loadWebEnv(
  overrides: Partial<WebEnv> = {},
  source: NodeJS.ProcessEnv = process.env,
): WebEnv {
  return {
    serverBaseUrl: overrides.serverBaseUrl ?? resolveServerBaseUrl(source),
    supabaseUrl:
      overrides.supabaseUrl ??
      parseRequiredBrowserEnv(
        "NEXT_PUBLIC_SUPABASE_URL",
        source.NEXT_PUBLIC_SUPABASE_URL,
      ),
    supabaseAnonKey:
      overrides.supabaseAnonKey ??
      parseRequiredBrowserEnv(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
  };
}

function parseRequiredBrowserEnv(name: string, value: string | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`Missing required browser env: ${name}`);
  }

  return normalizedValue;
}

function resolveServerBaseUrl(source: NodeJS.ProcessEnv) {
  const configuredUrl = source.NEXT_PUBLIC_SERVER_BASE_URL?.trim();
  return configuredUrl || defaultServerBaseUrl;
}
