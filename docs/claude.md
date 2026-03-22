# The complete guide to ServiceWorker updates, caching, and PWA deployment

**A properly configured ServiceWorker update system requires coordinating four distinct layers: HTTP cache headers that prevent stale entry points, a SW lifecycle that safely transitions between versions, a client-side notification flow that gives users control over updates, and a deployment strategy that keeps old assets available during rollouts.** Getting any single layer wrong can leave users stuck on broken versions indefinitely. This report covers every technical detail needed to build a production-grade update architecture — from byte-level version detection to CDN purge strategies — and synthesizes them into a complete, recommended flow.

---

## How browsers detect and install new ServiceWorker versions

The browser performs a **byte-for-byte comparison** of the fetched SW script against the currently installed one. If even a single byte differs, the browser treats it as a new version and begins the installation process. This comparison extends to scripts loaded via `importScripts()` as of Chrome 78+ and Firefox 56+.

The ServiceWorker progresses through six states: `parsed` → `installing` → `installed` (waiting) → `activating` → `activated` → `redundant`. During **installing**, the `install` event fires and developers typically precache static assets using `event.waitUntil()`. If the promise rejects, the worker becomes `redundant` immediately. After successful installation, the worker enters the **installed/waiting** state — it will not activate until every tab controlled by the old SW is closed, or `skipWaiting()` is called.

Update checks are triggered by four mechanisms: navigation to an in-scope page (every time), calls to `registration.update()` from JavaScript, functional events like `push` and `sync` (unless checked within 24 hours), and changes to the registered script URL. For long-lived single-page applications where users may not navigate for hours, calling `registration.update()` on a periodic interval (typically hourly) is essential.

**The 24-hour HTTP cache limit is now largely academic.** Starting with Chrome 68, browsers bypass the HTTP cache entirely when fetching the top-level SW script — this is the default behavior controlled by the `updateViaCache` registration option, which defaults to `'imports'`. Under this default, the SW file always goes to the network, while `importScripts()` resources still consult the HTTP cache. Setting `updateViaCache: 'none'` bypasses the cache for everything. Even under the legacy `'all'` mode, browsers cap HTTP cache honoring at **86,400 seconds (24 hours)** to prevent users from being permanently stuck on an old version.

The `importScripts()` cache behavior underwent a major change. Before Chrome 78, imported scripts were fetched once and stored internally forever — the only update path was changing the import URL (e.g., appending a version number). Now, every update check for the top-level SW also checks imported scripts byte-for-byte. If any imported script differs, the full SW update flow triggers, even if the main script is unchanged.

When a new SW activates, it does not automatically control existing open pages. Calling `self.clients.claim()` in the `activate` handler overrides this, immediately taking control of all in-scope clients and firing a `controllerchange` event on `navigator.serviceWorker` in each tab. This is complementary to `skipWaiting()`: the former skips the waiting phase, the latter claims existing pages. Together, they provide immediate takeover — but at the cost of consistency guarantees.

---

## Detecting updates and safely prompting users

Detection must handle two distinct scenarios: a worker that was already waiting when the page loads, and a new update that arrives while the page is open. The complete detection pattern combines both:

```javascript
const registration = await navigator.serviceWorker.register('/sw.js');

// Scenario 1: SW was already waiting (user ignored a previous prompt)
if (registration.waiting) {
  showUpdateNotification(registration);
}

// Scenario 2: New update discovered while page is open
registration.addEventListener('updatefound', () => {
  const newWorker = registration.installing;
  newWorker.addEventListener('statechange', () => {
    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
      showUpdateNotification(registration);
    }
  });
});
```

The check for `navigator.serviceWorker.controller` distinguishes a genuine update from a first-time install — if `controller` is null, no previous SW was active and there's nothing to "update" from.

**Never call `skipWaiting()` unconditionally in the install event.** Jake Archibald's canonical warning applies: "your new service worker is likely controlling pages that were loaded with an older version. This means some of your page's fetches will have been handled by your old service worker, but your new service worker will be handling subsequent fetches." The safe pattern uses `postMessage` to let the client decide when to trigger the transition:

```javascript
// Client side: user clicks "Update"
registration.waiting.postMessage({ type: 'SKIP_WAITING' });

// Service Worker side
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
```

After `skipWaiting()` executes, the new SW activates and the `controllerchange` event fires in every open tab. The standard reload pattern includes an infinite-loop guard:

```javascript
let refreshing = false;
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
});
```

The UI pattern should be a non-blocking toast or banner — not a modal — with a clear "Update" action and an optional "Later" dismiss. If the user dismisses, re-check `registration.waiting` on subsequent page loads and re-prompt. For SPAs, an effective pattern is triggering the update during route transitions rather than interrupting the user's current activity.

### The multi-tab problem is inherent to skipWaiting

When `skipWaiting()` fires, **all tabs** simultaneously get the new SW. Tabs that weren't the one where the user clicked "Update" may be running old HTML with old JavaScript — and the new SW's `activate` handler may purge old precached assets. This creates a window where lazy-loaded chunks from the old version vanish from both the cache (purged) and the server (deleted on deploy).

Mitigation requires a layered approach. First, ensure every tab registers a `controllerchange` listener that triggers a reload. Second, use `BroadcastChannel` to warn all tabs before triggering `skipWaiting`, allowing each tab to auto-save state. Third, retain old precache entries briefly during activation rather than purging immediately. Fourth, keep old hashed assets on the server for a grace period (covered in the deployment section below).

The **ChunkLoadError** problem affects code-split SPAs independently of ServiceWorkers but is amplified by them. When a deployment changes chunk hashes and the old `index.html` references deleted chunks, dynamic imports fail with `ChunkLoadError: Loading chunk X failed` (webpack) or `Failed to fetch dynamically imported module` (Vite). The most robust client-side mitigation wraps lazy imports with retry logic that auto-reloads once using a `sessionStorage` flag to prevent infinite loops. Error boundaries should catch these failures and present a "New version available — click to reload" UI rather than a blank screen.

---

## HTTP headers that make or break the update flow

The entire update system depends on correct cache headers for three categories of resources. Getting these wrong silently breaks everything — users get stuck on stale versions with no visible error.

### The SPA entry point must always revalidate

For `index.html`, the recommended header is **`Cache-Control: no-cache`** paired with an `ETag`. This allows the browser to store the response but forces revalidation before every use. When the HTML hasn't changed, the server returns a **304 Not Modified** (~200 bytes of headers, no body), making this nearly as efficient as caching while guaranteeing freshness. The alternative `no-cache, no-store, must-revalidate` prevents any storage at all — this eliminates 304 savings, disables the back-forward cache, and is only warranted for pages with sensitive data.

The precise directive semantics matter: `no-cache` means "store but always revalidate" (not "don't cache"), `no-store` means "never write to disk or memory," and `must-revalidate` means "once stale, you must revalidate or return 504." The combination `max-age=0, must-revalidate` is semantically equivalent to `no-cache` per the HTTP spec — MDN explicitly states there's no reason to use this older form since HTTP/1.1-conformant servers are universal.

`Pragma: no-cache` and `Expires: 0` are HTTP/1.0 relics. Include them only if your infrastructure encounters HTTP/1.0 proxies; for modern deployments, `Cache-Control` alone is sufficient.

### The ServiceWorker file gets defense-in-depth headers

Modern browsers already bypass the HTTP cache for SW scripts by default. Server-side headers of `Cache-Control: no-cache, no-store, must-revalidate` serve as defense-in-depth for older browsers, non-standard clients, or registrations that explicitly set `updateViaCache: 'all'`.

### Hashed assets get aggressive, permanent caching

Content-hashed files like `app.abc123.js` should use `Cache-Control: public, max-age=31536000, immutable`. The `immutable` directive tells browsers not to send conditional revalidation requests even on user-initiated reload — Facebook reported **~60% reduction in spurious revalidation requests** after adopting it. Chrome doesn't formally support `immutable` but already suppresses subresource revalidation on reload by default; Firefox (49+), Safari (11+), and legacy Edge (15-18) honor it explicitly. The directive is always safe to include since non-supporting browsers simply ignore it.

### CDN headers enable independent cache control

Three mechanisms allow different cache durations for CDN versus browser:

- **`s-maxage`** within `Cache-Control` applies only to shared caches: `Cache-Control: max-age=60, s-maxage=3600` gives browsers 60 seconds and CDN edges 1 hour
- **`CDN-Cache-Control`** (RFC 9213, published 2022) is the standardized targeted header co-authored by Akamai, Fastly, and Cloudflare — it supports all cache directives, not just TTL
- **`Surrogate-Control`** is the pre-standard equivalent used by Varnish and Fastly, now superseded by `CDN-Cache-Control`

Cloudflare adds its own **`Cloudflare-CDN-Cache-Control`** header for Cloudflare-specific overrides that don't propagate downstream. The precedence is: `Cloudflare-CDN-Cache-Control` > `CDN-Cache-Control` > `Surrogate-Control` > `Cache-Control`.

**Cloudflare does not cache HTML by default** — HTML responses return `cf-cache-status: DYNAMIC` unless a Cache Rule explicitly marks them eligible. For SPAs, this means `index.html` is naturally uncached at the edge without any configuration. Hashed static assets (JS, CSS, images) are cached automatically based on file extension. After deployment, purge only the unhashed files (`index.html`, `sw.js`) via the API — hashed assets with new filenames are automatically cache-misses.

---

## Hashed assets, SPA routing, and the stale entry-point trap

Modern bundlers (Vite, webpack, Rollup) embed content hashes in filenames — any source change produces a different hash and therefore a completely new URL. This is strictly superior to query-string cache busting (`app.js?v=2`) because some CDNs and proxies ignore query parameters for cache keys.

The two-tier caching strategy is foundational: **permanent caching for hashed assets, zero caching for `index.html`.** Since `index.html` is the sole document that references hashed asset URLs via `<script>` and `<link>` tags, it is the single point through which the browser discovers which version of the application to load. If `index.html` is stale, every reference points to potentially deleted files.

SPA routing amplifies this risk. Because all routes fall back to `index.html` (via nginx's `try_files $uri /index.html`, Netlify's `/* /index.html 200`, or equivalent), a stale `index.html` means **100% of navigation** serves the old version. The server configuration is straightforward — serve `index.html` for any path that doesn't match a static file — but the cache implications are severe.

### Deployment order prevents the gap

The correct deployment sequence is:

1. **Upload new hashed assets first** (additive — no conflicts with existing files)
2. **Upload new `index.html`** (atomic switch to new version)
3. **Purge CDN cache** for `index.html` and `sw.js` only
4. **Clean up old assets** after a grace period of 24–48 hours

Never delete old hashed files at deploy time. Since filenames are unique, old and new assets coexist without conflict. Users with cached `index.html` referencing old chunks can still load them. CDN edge caches also provide a natural buffer — assets cached at the edge with year-long TTLs remain available even if deleted from the origin, though not every edge node may have them cached.

For graceful chunk-loading error recovery, wrap dynamic imports with retry logic:

```javascript
const lazyRetry = (importFn) => new Promise((resolve, reject) => {
  const hasRefreshed = JSON.parse(
    sessionStorage.getItem('retry-lazy-refreshed') || 'false'
  );
  importFn()
    .then(component => {
      sessionStorage.setItem('retry-lazy-refreshed', 'false');
      resolve(component);
    })
    .catch(error => {
      if (!hasRefreshed) {
        sessionStorage.setItem('retry-lazy-refreshed', 'true');
        return window.location.reload();
      }
      reject(error);
    });
});
```

---

## Workbox and modern PWA tooling in practice

Workbox is the dominant ServiceWorker library, used by **54% of mobile sites** and maintained by Chrome's Aurora team. The current release is **v7.4.0** (November 2025). Its modular architecture separates concerns cleanly: `workbox-precaching` and `workbox-strategies` run inside the SW, `workbox-window` runs on the page, and `workbox-build`/`workbox-webpack-plugin` run at build time.

### workbox-window abstracts the entire client-side lifecycle

The `Workbox` class replaces manual `navigator.serviceWorker.register()` with lifecycle-aware events. Its **`messageSkipWaiting()`** method (introduced in v6) specifically targets the waiting SW — fixing a subtle bug in the older `messageSW()` approach that could accidentally send the SKIP_WAITING message to the active SW instead.

```javascript
import { Workbox } from 'workbox-window';

const wb = new Workbox('/sw.js');

wb.addEventListener('waiting', async (event) => {
  wb.addEventListener('controlling', () => window.location.reload());
  const accepted = await showUpdatePrompt();
  if (accepted) wb.messageSkipWaiting();
});

wb.register();
```

Events include `installed` (SW installed), `waiting` (SW stuck waiting), `controlling` (new SW has taken control), and `activated` (SW fully active). Each carries an **`isUpdate`** boolean distinguishing first-time installs from updates, and `wasWaitingBeforeRegister` to detect pre-existing waiting workers.

### workbox-precaching handles revision tracking automatically

The precache manifest maps URLs to revisions: hashed URLs set `revision: null` (the hash is the version), while unhashed URLs like `index.html` get an explicit revision string auto-generated by build tools. During installation, only changed entries are downloaded. During activation, removed entries are purged. The `self.__WB_MANIFEST` injection point is replaced at build time with the full manifest array.

### Runtime caching strategies cover every use case

- **`CacheFirst`** — immutable assets (hashed JS/CSS, fonts): check cache, fetch only on miss
- **`NetworkFirst`** — dynamic content (HTML, API responses): try network with timeout, fall back to cache
- **`StaleWhileRevalidate`** — semi-dynamic content (avatars, non-critical resources): serve cached instantly, update in background
- **`NetworkOnly`** and **`CacheOnly`** — for non-cacheable requests and precache-only assets respectively

`NavigationRoute` combined with `createHandlerBoundToURL('/index.html')` implements the app-shell pattern, serving precached HTML for all navigation requests. **Navigation Preload** (`workbox-navigation-preload`) eliminates SW boot-up delay by starting the navigation fetch in parallel with SW startup — critical for `NetworkFirst` HTML strategies on mobile where SW boot can add 50–500ms.

### Framework integrations wrap Workbox with zero-config

**vite-plugin-pwa** (`@vite-pwa/vite`) is the leading Vite integration. Its `registerType: 'prompt'` mode generates the complete update-prompt flow via virtual modules (`virtual:pwa-register/react`, `/vue`, `/svelte`). The `registerType: 'autoUpdate'` mode forces `skipWaiting` + `clientsClaim` for apps that don't need user consent. Framework variants exist for Remix, Nuxt, SvelteKit, and Astro.

**@angular/service-worker** takes a fundamentally different approach — declarative JSON configuration (`ngsw-config.json`) with no custom SW code. It groups all files into atomic versions and detects version mismatches, triggering unrecoverable-error states that force full refreshes. This provides stronger consistency guarantees than Workbox's manual approach but offers far less flexibility.

**Serwist** has emerged as a modernized, TypeScript-first fork of Workbox that merges all SW packages into a single import, drops the `GenerateSW` mode in favor of `InjectManifest` only, and provides built-in integrations for Next.js, Vite, Svelte, and Nuxt.

---

## The complete update flow architecture

The following architecture synthesizes all layers into a production-ready system. It covers server configuration, SW lifecycle management, client-side notification, and deployment strategy as a unified flow.

### Server-side header configuration

| Resource | `Cache-Control` | Additional | Purpose |
|---|---|---|---|
| `index.html` | `no-cache` | `ETag: "<hash>"` | Always revalidate; 304 when unchanged |
| `sw.js` | `no-cache, no-store, must-revalidate` | — | Defense-in-depth (browsers bypass cache anyway) |
| `assets/*.[hash].*` | `public, max-age=31536000, immutable` | — | Permanent cache; busted by filename change |
| CDN layer for `index.html` | — | `CDN-Cache-Control: max-age=60` | Short CDN TTL; purge on deploy |

### The full update message flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT TRIGGERS UPDATE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. DEPLOY: Upload new hashed assets → update index.html →     │
│     purge CDN for index.html and sw.js                          │
│                                                                 │
│  2. UPDATE CHECK: Browser fetches sw.js on navigation           │
│     (or via registration.update() on hourly interval)           │
│     ┌──────────────────────────────────────────┐                │
│     │  Byte-for-byte comparison detects change │                │
│     └──────────────┬───────────────────────────┘                │
│                    ▼                                            │
│  3. INSTALL: New SW enters 'installing' state                   │
│     → Precaches new/changed assets from updated manifest        │
│     → Transitions to 'installed' (waiting) state                │
│                    │                                            │
│                    ▼                                            │
│  4. CLIENT DETECTION:                                           │
│     registration.waiting is non-null                            │
│     OR updatefound → statechange → installed                    │
│                    │                                            │
│                    ▼                                            │
│  5. USER PROMPT: Toast/banner appears:                          │
│     "A new version is available. [Update] [Later]"              │
│                    │                                            │
│              user clicks "Update"                               │
│                    │                                            │
│                    ▼                                            │
│  6. SKIP_WAITING MESSAGE:                                       │
│     registration.waiting.postMessage({type: 'SKIP_WAITING'})    │
│     (or wb.messageSkipWaiting() with Workbox)                   │
│                    │                                            │
│                    ▼                                            │
│  7. SW ACTIVATION: self.skipWaiting() → 'activating' state      │
│     → activate event: clean old precache entries                │
│     → self.clients.claim() → 'activated' state                 │
│                    │                                            │
│                    ▼                                            │
│  8. CONTROLLER CHANGE: controllerchange event fires in ALL tabs │
│     → Each tab: if (!refreshing) { refreshing=true; reload() } │
│                    │                                            │
│                    ▼                                            │
│  9. FRESH PAGE: Browser loads new index.html → references       │
│     new hashed assets → new SW serves from updated precache     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Polling strategy for long-lived SPAs

For single-page applications where users may stay on a single page for hours without navigating, the browser's navigation-triggered update check never fires. Implement periodic polling:

```javascript
const registration = await navigator.serviceWorker.register('/sw.js');
// Check for updates every hour
setInterval(() => registration.update(), 60 * 60 * 1000);
```

Some teams also trigger `registration.update()` on visibility change (when the tab becomes visible after being backgrounded) or on SPA route transitions, providing more natural update points.

### Edge cases and their mitigations

**Multiple tabs with stale code.** When `skipWaiting()` fires, every tab gets the new SW simultaneously. Tabs that don't have the `controllerchange` reload handler (loaded before the handler code was deployed) will enter a broken mixed state. Mitigation: the new SW's `activate` handler can force-navigate all clients via `self.clients.matchAll({type: 'window'}).then(tabs => tabs.forEach(t => t.navigate(t.url)))`. This is aggressive but guarantees consistency.

**Partial updates and chunk loading errors.** Between deployment and a user's page reload, old `index.html` may reference deleted chunk hashes. Mitigation is three-layered: (1) retain old hashed assets on the server for 24–48 hours, (2) SW precaching serves cached chunks regardless of server state, (3) client-side error boundaries catch `ChunkLoadError` and prompt the user to reload.

**The activation-to-reload gap.** Between `skipWaiting()` and `window.location.reload()`, the page runs old HTML/JS but network requests are handled by the new SW. Minimize this gap by triggering reload immediately in the `controllerchange` handler with no async operations in between. Design SW fetch handlers to be backward-compatible — use `NetworkFirst` for API calls so old-format requests still work, and rely on content-hashed URLs ensuring that old asset requests are either served from cache or fetched from the server (if old files are retained).

**First visit after clearing browser data.** When the SW precache is empty and the browser cache is cold, all assets must come from the network. Ensure your CDN can handle the thundering-herd effect of a cache purge. Use `stale-while-revalidate` on `index.html` at the CDN level (`CDN-Cache-Control: max-age=60, stale-while-revalidate=86400`) to serve slightly stale HTML from the edge while revalidating, rather than routing all traffic to the origin.

### Recommended production configuration with Workbox

**Service Worker (`sw.js`):**
```javascript
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import * as navigationPreload from 'workbox-navigation-preload';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
navigationPreload.enable();

// App shell for SPA navigation
registerRoute(new NavigationRoute(
  createHandlerBoundToURL('/index.html'),
  { denylist: [/^\/api\//] }
));

// API calls — network first with cache fallback
registerRoute(
  ({url}) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName: 'api', networkTimeoutSeconds: 5 })
);

// Images — cache first with expiration
registerRoute(
  ({request}) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 86400 })]
  })
);

// Handle skip-waiting message from client
addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
```

**Client entry point:**
```javascript
import { Workbox } from 'workbox-window';

if ('serviceWorker' in navigator) {
  const wb = new Workbox('/sw.js');

  wb.addEventListener('waiting', (event) => {
    showUpdateBanner({
      onAccept: () => {
        wb.addEventListener('controlling', () => window.location.reload());
        wb.messageSkipWaiting();
      }
    });
  });

  const reg = await wb.register();
  setInterval(() => reg?.update(), 60 * 60 * 1000);
}
```

## Conclusion

The ServiceWorker update system is deceptively complex because it spans four independent layers — HTTP caching, browser SW lifecycle, client-side JavaScript, and deployment infrastructure — and failures in any layer are silent. **The single most critical configuration is ensuring `index.html` is never cached long-term**, since it is the pivot point connecting users to the correct version of every other asset. Content-hashed filenames make static assets trivially cacheable forever, but only if the document referencing them is always fresh.

The `skipWaiting()` mechanism intentionally breaks the SW lifecycle's core consistency guarantee — that only one version runs at a time — which is why it must always be user-initiated via `postMessage`, never automatic. The multi-tab problem is inherent and has no perfect solution; the best mitigation combines `controllerchange` reload handlers in every tab, retained old assets on the server, and precaching as a safety net.

Workbox's `workbox-window` library with `messageSkipWaiting()` and the `waiting`/`controlling` event pair represents the current best practice, abstracting the most error-prone parts of the flow into tested, well-documented APIs. For teams using Vite, `vite-plugin-pwa` with `registerType: 'prompt'` provides the entire system out of the box. The key architectural insight is that **the SW precache is both the update mechanism and the reliability layer** — it detects new versions via manifest changes, serves cached assets when the server is unavailable, and provides a consistent snapshot of the application during the transition between versions.