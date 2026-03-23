const defaultServerBaseUrl = "http://localhost:3001";

export function getServerBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SERVER_BASE_URL?.trim();
  return configuredUrl || defaultServerBaseUrl;
}
