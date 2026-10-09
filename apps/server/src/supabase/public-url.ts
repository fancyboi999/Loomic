/** Storage SDK URLs use the server's Supabase host, which can be Docker-only. */
export function browserStorageUrl(storageUrl: string, publicBaseUrl?: string): string {
  if (!publicBaseUrl) return storageUrl;
  const url = new URL(storageUrl);
  const publicBase = new URL(publicBaseUrl);
  url.protocol = publicBase.protocol;
  url.host = publicBase.host;
  return url.toString();
}
