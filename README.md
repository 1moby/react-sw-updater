# react-sw-updater

Lightweight React library for detecting app updates via version polling — with cache-busting, offline awareness, chunk error recovery, and a drop-in update banner.

**Zero runtime dependencies. ~3KB gzipped.**

## How It Works

1. Your build tool generates a `version.json` with a unique build version
2. The library polls `version.json` with aggressive cache-busting (timestamp param + `no-store` + `no-cache` headers)
3. When the server version differs from the bundled version, an update prompt appears
4. On accept: unregisters service workers, clears all caches, hard-reloads with a CDN-busting param

## Install

```bash
npm install react-sw-updater
```

## Quick Start

### 1. Add the Vite plugin

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { updateChecker } from 'react-sw-updater/vite';

export default defineConfig({
  plugins: [react(), updateChecker()],
});
```

The plugin:
- Generates a deterministic `BUILD_VERSION` (git hash + timestamp)
- Defines `__BUILD_VERSION__` as a global constant in your bundle
- Writes `version.json` to your output directory on build
- Deduplicates React (prevents dual-instance issues)

### 2. Add the provider to your app

```tsx
// App.tsx
import { UpdateProvider, useUpdateContext, UpdateBanner } from 'react-sw-updater';

declare const __BUILD_VERSION__: string;

function AppUpdateBanner() {
  const { updateAvailable, applyUpdate, dismiss } = useUpdateContext();
  if (!updateAvailable) return null;

  return (
    <UpdateBanner
      onAccept={applyUpdate}
      onDismiss={dismiss}
    />
  );
}

export default function App() {
  return (
    <UpdateProvider currentVersion={__BUILD_VERSION__}>
      <AppUpdateBanner />
      {/* your app */}
    </UpdateProvider>
  );
}
```

That's it. The library handles polling, cache-busting, offline detection, and reload-loop prevention automatically.

## Next.js Setup

```javascript
// next.config.js
const { withUpdateChecker } = require('react-sw-updater/nextjs');

module.exports = withUpdateChecker({
  // your Next.js config
});
```

Then use `process.env.NEXT_PUBLIC_BUILD_VERSION` as your `currentVersion`.

## API

### `<UpdateProvider>`

Context provider that handles version polling and update detection.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentVersion` | `string` | *required* | Build-time version baked into the bundle |
| `versionUrl` | `string` | `'/version.json'` | URL to the version endpoint |
| `checkInterval` | `number` | `300000` (5 min) | Polling interval in ms |
| `swUrl` | `string` | — | Optional SW to register for offline caching |

### `useUpdateContext()`

Returns the update state from the nearest `<UpdateProvider>`.

```typescript
interface UpdateCheckerResult {
  updateAvailable: boolean;      // true when server version differs
  serverVersion: string | null;  // the server's version string
  applyUpdate: () => void;       // clear caches + hard reload
  dismiss: () => void;           // hide banner until next page load
}
```

### `useUpdateChecker(options)`

Standalone hook (no provider needed) with the same options and return type.

### `<UpdateBanner>`

Pre-styled, accessible banner component.

| Prop | Type | Default |
|------|------|---------|
| `message` | `string` | `'A new version is available.'` |
| `acceptLabel` | `string` | `'Update'` |
| `dismissLabel` | `string` | `'Later'` |
| `onAccept` | `() => void` | *required* |
| `onDismiss` | `() => void` | — |
| `className` | `string` | — |
| `style` | `CSSProperties` | — |

### Utilities

```typescript
import { isChunkLoadError, retryDynamicImport } from 'react-sw-updater';

// Detect chunk load errors (code-split lazy imports failing after deploy)
isChunkLoadError(error); // boolean

// Wrap lazy imports with auto-retry on chunk errors
const MyPage = lazy(() => retryDynamicImport(() => import('./MyPage')));

// Per-tab state persistence (survives reload, isolated per tab)
import { persistState, restoreState } from 'react-sw-updater';
persistState('form-data', { name: 'John' });
const data = restoreState('form-data'); // null if not found (auto-cleans)
```

## Reliability Features

- **Fetch timeout** — 10s AbortController timeout prevents hanging on slow networks
- **Concurrent check dedup** — visibility-change + timer firing simultaneously won't cause duplicate fetches
- **Offline awareness** — skips polling when `navigator.onLine` is false, checks immediately when connectivity returns
- **Reload-loop guard** — `applyUpdate()` blocks rapid successive reloads (30s cooldown) in case CDN hasn't purged yet
- **Per-route chunk retry** — `retryDynamicImport` uses per-pathname keys so a chunk error on `/settings` doesn't block retry on `/dashboard`
- **Recursive setTimeout** — never uses `setInterval`, preventing call stacking on slow networks

## How `applyUpdate()` Works

When the user accepts the update:

1. Unregisters all service workers
2. Clears all Cache API caches
3. Navigates with a `_uc=<timestamp>` cache-bust param (cleaned up on next load)

This "nuclear" approach guarantees the browser loads fresh assets regardless of CDN, SW, or HTTP cache state.

## License

MIT
