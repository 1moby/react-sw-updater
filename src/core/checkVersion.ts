export interface VersionInfo {
  version: string;
  gitHash?: string;
  buildTime?: string;
}

export interface CheckResult {
  updateAvailable: boolean;
  serverVersion: string | null;
}

const NO_UPDATE: CheckResult = { updateAvailable: false, serverVersion: null };

/** In-flight check deduplication — prevents concurrent fetches from
 *  visibility-change + timer firing at the same time. */
let inflightCheck: Promise<CheckResult> | null = null;

/**
 * Fetch version.json with cache-busting to bypass browser cache,
 * CDN cache (Cloudflare, etc.), and proxy caches.
 * Compare server version against the build-time version baked into the JS bundle.
 *
 * - Uses AbortController to timeout after 10s (prevents hanging on slow networks)
 * - Deduplicates concurrent calls (visibility-change + timer race)
 * - Skips check when browser is offline
 */
export async function checkVersion(
  versionUrl: string,
  currentVersion: string,
  options?: { timeoutMs?: number },
): Promise<CheckResult> {
  // Skip when offline — avoids unnecessary errors and battery drain
  if (typeof navigator !== 'undefined' && !navigator.onLine) return NO_UPDATE;

  // Deduplicate concurrent checks
  if (inflightCheck) return inflightCheck;

  inflightCheck = doCheck(versionUrl, currentVersion, options?.timeoutMs ?? 10_000);
  try {
    return await inflightCheck;
  } finally {
    inflightCheck = null;
  }
}

async function doCheck(
  versionUrl: string,
  currentVersion: string,
  timeoutMs: number,
): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Cache-bust with timestamp query param — bypasses ALL cache layers
    const separator = versionUrl.includes('?') ? '&' : '?';
    const url = `${versionUrl}${separator}_v=${Date.now()}`;

    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if (!res.ok) return NO_UPDATE;

    const data: VersionInfo = await res.json();
    if (!data.version) return NO_UPDATE;

    return {
      updateAvailable: data.version !== currentVersion,
      serverVersion: data.version,
    };
  } catch {
    return NO_UPDATE;
  } finally {
    clearTimeout(timer);
  }
}
