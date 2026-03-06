# react-sw-updater

A drop-in React library for detecting app updates via version.json polling and prompting users to reload. Works with any React app.

## Project Structure

```
src/
  core/          # Pure JS functions: checkVersion, applyUpdate
  hooks/         # React hook: useUpdateChecker
  components/    # UpdateBanner, UpdateProvider + useUpdateContext
  utils/         # sessionStorage persistence, chunk error detection, retry logic
  index.ts       # Public API barrel export
  vite.ts        # Vite plugin (generates version.json, defines __BUILD_VERSION__)
  nextjs.ts      # Next.js integration (withUpdateChecker wrapper)
tests/           # Vitest tests mirroring src/ structure
docs/            # Reference documentation (read-only)
```

## Tech Stack

- TypeScript (strict mode)
- React >=17 as peer dependency
- tsup for ESM + CJS dual builds
- Vitest + jsdom + @testing-library/react for tests

## Conventions

- All public functions/hooks/components are exported from `src/index.ts`
- Core functions (`src/core/`) must be framework-agnostic (no React imports)
- Hooks (`src/hooks/`) wrap core functions with React lifecycle
- Use recursive setTimeout for polling, never setInterval
- Guard against infinite reload loops with sessionStorage
- Tests live in `tests/` and mirror the src structure

## Commands

- `npm test` — run all tests once
- `npm run test:watch` — run tests in watch mode
- `npm run build` — build with tsup
- `npm run typecheck` — type-check without emitting

## Key Design Decisions

- Update detection polls version.json (not SW lifecycle) for simplicity and reliability
- checkVersion uses AbortController timeout (10s), concurrent call dedup, and offline guard
- applyUpdate is "nuclear": unregister SWs → clear caches → hard reload with CDN-bust param
- applyUpdate has a 30s sessionStorage-based reload-loop guard
- retryDynamicImport uses per-pathname keys so chunk errors are isolated per route
- sessionStorage (not localStorage) for per-tab state isolation
