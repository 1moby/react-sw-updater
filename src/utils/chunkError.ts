const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk .+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const text = `${error.name} ${error.message}`;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

const RETRY_PREFIX = '__update_checker_retry__';

/**
 * Wraps a dynamic import with single-retry logic for chunk load errors.
 *
 * Uses a per-module key so a chunk error on route A doesn't block retry
 * on route B. Defaults to current pathname; override for non-route lazy loads.
 * Clears the flag on success so future deploys can retry again.
 */
export function retryDynamicImport<T>(
  importFn: () => Promise<T>,
  moduleKey?: string,
): Promise<T> {
  const key = `${RETRY_PREFIX}${moduleKey ?? location.pathname}`;

  return importFn()
    .then((mod) => {
      sessionStorage.removeItem(key);
      return mod;
    })
    .catch((error) => {
      const hasRefreshed = sessionStorage.getItem(key) === 'true';

      if (!hasRefreshed && isChunkLoadError(error)) {
        sessionStorage.setItem(key, 'true');
        window.location.reload();
        return new Promise<T>(() => {});
      }

      sessionStorage.removeItem(key);
      throw error;
    });
}
