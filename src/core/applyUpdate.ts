const LOOP_GUARD_KEY = '__update_checker_applied__';
const LOOP_GUARD_MAX_AGE_MS = 30_000; // 30 seconds

/**
 * Nuclear update: unregister all service workers, clear all caches,
 * then hard-reload with a cache-busting query param to bypass CDN.
 *
 * Includes a reload-loop guard: if applyUpdate was called within the
 * last 30s (e.g. version.json is still stale after CDN reload), it
 * bails out to prevent an infinite reload loop.
 *
 * The cache-bust param (_uc) is cleaned up on the next page load
 * by the UpdateProvider component.
 */
export async function applyUpdate(): Promise<void> {
  // Reload-loop guard: prevent rapid successive reloads
  try {
    const lastApplied = sessionStorage.getItem(LOOP_GUARD_KEY);
    if (lastApplied) {
      const elapsed = Date.now() - Number(lastApplied);
      if (elapsed < LOOP_GUARD_MAX_AGE_MS) {
        console.warn(
          '[react-sw-updater] applyUpdate blocked by loop guard — last reload was',
          Math.round(elapsed / 1000) + 's ago.',
          'This usually means version.json still has the old version after reload.',
          'Check that your build writes version.json before deploy, and that CDN cache is purged.'
        );
        return;
      }
    }
    sessionStorage.setItem(LOOP_GUARD_KEY, Date.now().toString());
  } catch {
    // sessionStorage unavailable — proceed without guard
  }

  try {
    // 1. Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }

    // 2. Clear all Cache API caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Continue with reload even if cleanup fails
  }

  // 3. Hard reload with cache-bust param to bypass CDN
  const url = new URL(window.location.href);
  url.searchParams.set('_uc', Date.now().toString());
  window.location.replace(url.toString());
}
