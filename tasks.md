# Update Checker Library - Task List

A drop-in React library for detecting Service Worker updates and prompting users to reload.
Works with any React app that uses a Service Worker (Vite PWA, CRA, custom SW, etc.).

## Phase 1: Project Setup

- [x] Task 1.1: Initialize npm package with TypeScript, React as peer dependency
- [x] Task 1.2: Configure tsconfig, build tooling (tsup for bundling ESM + CJS)
- [x] Task 1.3: Configure Vitest + jsdom for testing
- [x] Task 1.4: Create CLAUDE.md with project conventions

## Phase 2: Core Service Worker Update Detection (`src/core/`)

- [ ] Task 2.1: `registerAndDetect(swUrl, options)` — registers SW, detects waiting worker (both already-waiting and updatefound→installed scenarios), returns registration
- [ ] Task 2.2: `pollForUpdates(registration, intervalMs)` — recursive setTimeout polling (not setInterval), calls `registration.update()`, supports visibility-change triggers
- [ ] Task 2.3: `activateUpdate(registration)` — sends `SKIP_WAITING` postMessage to waiting worker, listens for `controllerchange`, triggers reload with infinite-loop guard
- [ ] Task 2.4: `onUpdateAvailable(registration, callback)` — unified listener that fires callback when a new SW is waiting (handles both page-load waiting and runtime updatefound)

## Phase 3: React Hooks (`src/hooks/`)

- [ ] Task 3.1: `useServiceWorker(swUrl, options)` — registers SW on mount, returns `{ registration, isUpdateAvailable, updateError }`
- [ ] Task 3.2: `useUpdatePolling(registration, intervalMs)` — starts recursive-setTimeout polling, pauses when tab hidden (optional), resumes on visibility change
- [ ] Task 3.3: `useUpdatePrompt(registration)` — returns `{ isUpdateAvailable, acceptUpdate, dismissUpdate }`, handles the full skipWaiting→controllerchange→reload flow

## Phase 4: React Components (`src/components/`)

- [ ] Task 4.1: `<UpdateBanner message? onAccept? onDismiss? />` — renders a non-modal banner/toast when update is available, fully styleable via className/style props
- [ ] Task 4.2: `<ServiceWorkerProvider swUrl options children />` — context provider that wires up registration + polling + detection, exposes state via `useServiceWorkerContext()`

## Phase 5: Utilities (`src/utils/`)

- [ ] Task 5.1: `persistState(key, data)` / `restoreState(key)` — sessionStorage-based state persistence for pre-reload state saving
- [ ] Task 5.2: `isChunkLoadError(error)` — deterministic detection of ChunkLoadError / dynamic import failures
- [ ] Task 5.3: `retryDynamicImport(importFn)` — wraps lazy imports with single-retry + sessionStorage guard to prevent infinite reload loops

## Phase 6: Tests (`tests/`)

- [ ] Task 6.1: Tests for `registerAndDetect` — mock SW registration, verify waiting detection, verify updatefound flow
- [ ] Task 6.2: Tests for `pollForUpdates` — verify recursive setTimeout (not setInterval), verify cleanup on unmount
- [ ] Task 6.3: Tests for `activateUpdate` — verify postMessage sent to waiting worker, verify controllerchange reload with loop guard
- [ ] Task 6.4: Tests for `onUpdateAvailable` — verify callback fires for both already-waiting and updatefound scenarios
- [ ] Task 6.5: Tests for `useServiceWorker` hook — mock registration, verify state transitions
- [ ] Task 6.6: Tests for `useUpdatePolling` hook — verify polling starts/stops, verify visibility change behavior
- [ ] Task 6.7: Tests for `useUpdatePrompt` hook — verify accept/dismiss flow, verify reload on controllerchange
- [ ] Task 6.8: Tests for `<UpdateBanner />` — render test, click handlers, custom props
- [ ] Task 6.9: Tests for `<ServiceWorkerProvider />` — context propagation, children rendering
- [ ] Task 6.10: Tests for `persistState` / `restoreState` — sessionStorage read/write, cleanup
- [ ] Task 6.11: Tests for `isChunkLoadError` — various error shapes
- [ ] Task 6.12: Tests for `retryDynamicImport` — success path, retry path, infinite-loop guard

## Phase 7: Package Exports & Documentation

- [ ] Task 7.1: Configure package.json exports map (ESM + CJS), ensure tree-shaking works
- [ ] Task 7.2: Add JSDoc comments to all public APIs
