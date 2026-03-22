# Changelog

## 1.0.0 (2026-03-06)

### Features

- **Version polling** — polls `version.json` with cache-busting (timestamp param + `no-store` + `no-cache` headers)
- **`<UpdateProvider>`** — React context provider for version checking with configurable interval
- **`useUpdateChecker`** — standalone hook for version checking without provider
- **`useUpdateContext`** — consume update state from provider
- **`<UpdateBanner>`** — pre-styled, accessible update notification banner
- **`applyUpdate()`** — nuclear update: unregister SWs, clear caches, hard reload with CDN-bust param
- **`retryDynamicImport()`** — wrap lazy imports with per-route retry on chunk load errors
- **`isChunkLoadError()`** — detect ChunkLoadError / dynamic import failures
- **`persistState()` / `restoreState()`** — per-tab sessionStorage persistence
- **Vite plugin** — generates `version.json`, defines `__BUILD_VERSION__`, deduplicates React
- **Next.js integration** — `withUpdateChecker()` wrapper for next.config.js

### Reliability

- 10s fetch timeout via AbortController
- Concurrent check deduplication
- Offline-aware polling (skips when offline, checks on reconnect)
- Reload-loop guard (30s cooldown on `applyUpdate`)
- Per-route chunk error retry keys
- Recursive setTimeout (never setInterval)
- Visibility-change + online event triggers
