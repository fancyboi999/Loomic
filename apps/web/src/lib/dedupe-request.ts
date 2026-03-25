const inflight = new Map<string, Promise<unknown>>();

/**
 * Deduplicates concurrent identical requests.
 * If a request with the same key is already in-flight, returns the existing Promise.
 * Once resolved/rejected the entry is cleared so future calls proceed normally.
 */
export function dedupeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}
