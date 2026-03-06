import { useCallback, useEffect, useRef, useState } from 'react';
import { checkVersion } from '../core/checkVersion';
import { applyUpdate } from '../core/applyUpdate';

export interface UpdateCheckerOptions {
  /** Build-time version string baked into the JS bundle */
  currentVersion: string;
  /** URL to version.json. Default: '/version.json' */
  versionUrl?: string;
  /** Polling interval in ms. Default: 5 * 60 * 1000 (5 min) */
  checkInterval?: number;
  /** URL to service worker file (for offline caching). Optional. */
  swUrl?: string;
}

export interface UpdateCheckerResult {
  /** Whether a new version was detected on the server */
  updateAvailable: boolean;
  /** The server's version string, if detected */
  serverVersion: string | null;
  /** Clear all caches and reload to apply the update */
  applyUpdate: () => void;
  /** Dismiss the update banner (reappears on next page load) */
  dismiss: () => void;
}

export function useUpdateChecker(
  options: UpdateCheckerOptions,
): UpdateCheckerResult {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Clean up cache-bust param from previous applyUpdate() call
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('_uc')) {
      url.searchParams.delete('_uc');
      const clean =
        url.pathname + (url.search || '') + (url.hash || '');
      window.history.replaceState(null, '', clean);
    }
  }, []);

  // Register SW if provided (for offline caching, NOT for update detection)
  useEffect(() => {
    if (!options.swUrl || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register(options.swUrl, { updateViaCache: 'none' })
      .catch(() => {});
  }, [options.swUrl]);

  // Poll version.json with cache busting
  useEffect(() => {
    const { currentVersion } = optionsRef.current;
    const versionUrl = optionsRef.current.versionUrl ?? '/version.json';
    const interval = optionsRef.current.checkInterval ?? 5 * 60 * 1000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    async function check() {
      if (stopped) return;
      const result = await checkVersion(versionUrl, currentVersion);
      if (stopped) return;
      if (result.updateAvailable) {
        setUpdateAvailable(true);
        setServerVersion(result.serverVersion);
        // Stop polling — update is available
        return;
      }
      // Schedule next check (recursive setTimeout, never setInterval)
      if (!stopped) {
        timeoutId = setTimeout(check, interval);
      }
    }

    // First check after a short delay to not block initial render
    timeoutId = setTimeout(check, 5_000);

    // Check when tab becomes visible (user returns to the app)
    const onVisChange = () => {
      if (document.visibilityState === 'visible' && !stopped) {
        check();
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    // Check when browser comes back online after being offline
    const onOnline = () => {
      if (!stopped) check();
    };
    window.addEventListener('online', onOnline);

    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('online', onOnline);
    };
  }, [options.currentVersion, options.versionUrl, options.checkInterval]);

  const apply = useCallback(() => applyUpdate(), []);
  const dismiss = useCallback(() => setDismissed(true), []);

  return {
    updateAvailable: updateAvailable && !dismissed,
    serverVersion,
    applyUpdate: apply,
    dismiss,
  };
}
