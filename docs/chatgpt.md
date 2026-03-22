# Service Worker Update Lifecycle and Caching Architecture for PWAs

## Service Worker lifecycle and version detection

A Service Worker (SW) progresses through well-defined states: `parsed`, `installing`, `installed`, `activating`, `activated`, and `redundant`. citeturn3view0 In parallel, each Service Worker *registration* tracks up to three “slots”: an `installing worker`, a `waiting worker`, and an `active worker`. citeturn3view0 The spec is intentionally explicit that the **waiting worker’s** SW state is `installed` (this is where the common “installed/waiting” terminology comes from). citeturn3view0turn18view0

**How a browser detects a “new version”** is straightforward but strict: it fetches the SW script URL and compares it to the current copy; if it is **not byte-for-byte identical**, the browser treats it as an update and runs the install flow for the new worker. citeturn12view0turn2view0

**When update checks happen** depends on both the platform and your code. A widely cited lifecycle summary is that an update may be triggered by an in-scope navigation, some functional events like `push` and `sync` (subject to a recent-check guard), or explicit update logic. citeturn2view0 The spec itself also models update cadence with a “stale” concept: a registration becomes stale if its “last update check time” is more than **86400 seconds (24 hours)** ago. citeturn3view0 On the API side, `ServiceWorkerRegistration.update()` explicitly attempts to update by fetching the script URL and installing when it’s byte-different; it also notes cache-bypass behavior when the previous fetch is older than 24 hours. citeturn12view0

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["service worker lifecycle diagram installing installed waiting activated","service worker update flow waiting skipWaiting controllerchange","workbox service worker update prompt waiting event diagram"],"num_per_query":1}

A subtle but operationally important detail: modern browsers have invested in making SW updates “fresher” even when developers accidentally serve cache-friendly headers for the SW script. For example, Chrome changed behavior so that update checks for the **top-level** SW script are no longer fulfilled by the HTTP cache by default, specifically to avoid delayed updates caused by inadvertent `Cache-Control` headers. citeturn11view0turn2view0 However, that same change historically did **not** automatically apply to imported scripts in the same way, which is why `updateViaCache` exists and why SW caching policies still matter (especially across browsers and through CDNs). citeturn11view0turn18view1turn3view0

## Installed and waiting states in practice

After a new SW version finishes its `install` event successfully, it becomes `installed`. citeturn3view0turn0search5 What happens next depends on whether an existing active SW is still controlling at least one client (tab/window) within scope. If there *is* an active controller, the newly installed worker transitions into the “waiting phase” and does not activate yet. This design goal is not incidental: the lifecycle is built to keep pages consistent and to avoid multiple versions of a site running simultaneously (which can cause storage/schema conflicts and even data loss). citeturn2view0

The waiting phase is easy to misunderstand during development and in SPAs:

- The browser delays activation until the existing worker is controlling **zero** clients. citeturn2view0turn1view0  
- Even if a user has only one visible tab, a **refresh** can still overlap old and new documents long enough that the old SW is “still controlling a client,” so the new SW remains waiting. citeturn2view0turn1view0  
- Tooling like Workbox calls this out explicitly as a common confusion: reloading the current page often does not activate the waiting worker; instead you need either all controlled clients to unload, or you must explicitly skip waiting. citeturn1view0turn2view0

`skipWaiting()` exists specifically to override the waiting phase: it “forces the waiting service worker to become the active service worker.” citeturn12view1turn2view0 But both the platform and Workbox docs emphasize a core tradeoff: skipping waiting can put a **new** SW in control of pages that loaded under an **older** version, creating a risk of “mixed-version” behavior. citeturn2view0turn1view0turn12view1

## User-facing update notification and safe skipWaiting

A modern UX pattern is **“refresh-to-update”**: detect that a new SW is waiting, notify the user that an update is available, then (only after user intent) trigger `skipWaiting` and reload once the new SW is controlling. This pattern is heavily documented because it avoids the worst “mixed-version” hazards while still delivering timely updates. citeturn7view0turn2view0turn1view0

### Detection patterns

**Baseline (no library):** The platform provides the building blocks:

- `ServiceWorkerRegistration.updatefound` fires when `registration.installing` gets a new worker. citeturn18view0  
- `ServiceWorkerRegistration.waiting` references a worker whose state is `installed`. citeturn18view0turn3view0  
- You can also safely call `navigator.serviceWorker.register()` from controlled pages; it won’t restart installation if the scriptURL/scope are unchanged, but it may still make a network request for the SW script. citeturn18view1  

A common baseline heuristic (implied by the lifecycle model) is: if `registration.waiting` exists and `navigator.serviceWorker.controller` is non-null, you likely have an update waiting rather than a first install. The waiting worker will not activate until clients unload unless you coordinate activation. citeturn2view0turn18view0turn3view0

**Workbox-assisted:** Workbox’s window-side helper is designed specifically for lifecycle moments that map well to UI:

- `waiting` event: “a new service worker has installed, but it can’t activate until all tabs … unload.” citeturn1view0turn7view0  
- `messageSkipWaiting()`: sends a `{type: 'SKIP_WAITING'}` message to the waiting worker. citeturn1view0turn7view0  
- `controlling` event: used as a reliable moment to reload so that the page is now loaded under the new SW. citeturn7view0turn1view0  

### A robust “prompt + reload” implementation shape

Workbox’s documented “updates with immediacy” flow captures the core UX and safety mechanics:

1. Listen for `waiting` to show a toast/dialog (“New version available. Reload?”). citeturn7view0turn1view0  
2. If the user accepts, set a listener that reloads once the new SW is controlling. citeturn7view0  
3. Send the skip-waiting message to activate the new SW. citeturn7view0  
4. Ensure the SW can receive that message and invoke `self.skipWaiting()` in response. citeturn7view0turn12view1  

Illustrative (library-based) code structure:

```js
// window/app code (conceptual structure)
import { Workbox } from 'workbox-window';

if ('serviceWorker' in navigator) {
  const wb = new Workbox('/sw.js');

  wb.addEventListener('waiting', async () => {
    const accepted = await promptUserToReload(); // your UI
    if (!accepted) return;

    wb.addEventListener('controlling', () => {
      window.location.reload();
    });

    wb.messageSkipWaiting();
  });

  wb.register();
}
```

This reload timing is not just aesthetic. Workbox’s own guidance notes you may want to persist transient state before reloading. citeturn7view0 It also highlights UX complexity when a waiting worker persists across reloads (`wasWaitingBeforeRegister`) and the user keeps refreshing without closing tabs—an argument for a first-class update prompt rather than hoping refresh will resolve it. citeturn1view0turn7view0

### Making “activation → control” predictable

Two platform calls are central:

- `self.skipWaiting()` promotes waiting → active. citeturn12view1turn2view0  
- `clients.claim()` (in `activate`) allows the active SW to become controller for existing clients and triggers `controllerchange` in those clients. citeturn4search0turn2view0turn12view1  

Workbox documentation is explicit that “controlling” semantics hinge on claiming clients: the first time a SW installs, the page won’t be controlled until the next load unless the SW calls `clients.claim()`; and Workbox’s `controlling` event is only dispatched in cases where claiming occurs. citeturn1view0turn4search0turn2view0

In practice, this leads to two safer update postures:

- **Prompt-first (recommended for many SPAs):** Don’t skip waiting automatically. Wait for a user gesture, then skip waiting and reload at the moment control transfers. citeturn7view0turn2view0turn1view0  
- **Auto-update (higher risk):** Always skip waiting immediately. The lifecycle article warns that this can yield mixed-version fetch handling within a single page lifecycle and can break apps that assume strict coherence. citeturn2view0turn12view1turn1view0  

## Cache-Control for index.html and the service worker script

Because SW update checks, SPA navigations, and CDN behaviors intersect, caching policy needs to be deliberate for **entry points** (HTML and SW script) and aggressive for **immutable** hashed assets.

### What Cache-Control directives actually mean

Key Cache-Control semantics (for browsers *and* shared caches like CDNs):

- `no-cache` **does not mean “don’t cache.”** It means the response may be stored but must be revalidated with the origin before reuse. citeturn13view0turn16view1  
- `no-store` means **do not store** the response in any cache (private or shared). citeturn13view0turn16view1  
- `private` allows browser caching but disallows shared caching. citeturn13view0turn16view1  
- `s-maxage` controls freshness specifically in **shared caches** (and overrides `max-age` there). citeturn13view0  

These definitions matter because “prevent stale responses” and “prevent storing” are different goals.

### Recommended headers for the main index document

For most SPAs, the main HTML (`/`, `/index.html`) is the “version pointer” to your hashed bundles, so you usually want **server revalidation** every time.

A canonical best-practice pairing is:

```http
# index.html (or all HTML route entry points)
Cache-Control: no-cache
```

MDN explicitly demonstrates the “cache busting” pattern: long-lived caching for hashed assets plus `no-cache` for `index.html` so the browser will revalidate and pick up new HTML that references new asset URLs. citeturn13view0

If you prefer an explicit equivalent form:

```http
Cache-Control: max-age=0, must-revalidate
```

MDN notes this is effectively equivalent to `no-cache` in intent (and historically existed for compatibility). citeturn13view0turn16view0

If your requirement is stricter—**avoid storing HTML in browsers and CDNs entirely**—then:

```http
Cache-Control: no-store
```

This will prevent storage in both private and shared caches. citeturn13view0turn16view1 The tradeoff is higher latency and bandwidth because caches cannot reuse a stored copy at all (even via 304 revalidation). citeturn16view1turn16view0

### Recommended headers for the SW file itself

Historically, an overly cacheable SW script caused real-world “why aren’t my SW updates arriving?” failures; that’s a major reason Chrome changed its defaults for SW update checks. citeturn11view0turn2view0 Even with modern browser mitigations, the long tail of browsers and the presence of CDNs make conservative caching for the SW script still advisable. Chrome’s guidance explicitly says it remains a good idea to keep `Cache-Control: max-age=0` for SW scripts even though newer versions may ignore it during update checks. citeturn11view0

A practical configuration that aligns with both semantics and operational reality is:

```http
# sw.js (or service-worker.js)
Cache-Control: no-cache
# optionally, for shared caches:
Cache-Control: no-cache, s-maxage=0
```

`no-cache` forces revalidation before reuse. citeturn13view0turn16view1 Adding `s-maxage=0` is a direct way to ensure shared caches do not treat the object as fresh. citeturn13view0

Finally, because the SW update mechanism keys off the script URL and byte-diffing, the lifecycle article strongly recommends: **do not “version” the SW script URL** (e.g., `sw-v2.js`) in production, because you can create a self-referential trap where the old SW keeps serving old HTML that never registers the new SW URL. citeturn2view0

## Hashed static asset caching and SPA routing resilience

### HTTP caching strategy for hashed assets

For assets that include a content fingerprint in their URL (e.g., `app.4f3c2a.js`), the modern “well-lit path” is to cache hard and rely on URL change for freshness:

```http
# /assets/* where filenames are hashed/fingerprinted
Cache-Control: public, max-age=31536000, immutable
```

This is supported directly by modern web caching guidance: fingerprinted URLs can safely be cached “for a long time,” commonly one year (`31536000` seconds), and `immutable` reduces unnecessary revalidations for truly immutable resources. citeturn16view0turn16view1turn13view0

A key property of HTTP caching alone: you **cannot** force clients to update an already-cached resource until it becomes stale; the solution is changing the URL (fingerprinting). citeturn16view1

### Service worker precaching with hashed assets

Workbox’s precaching model is designed to align with fingerprinted asset naming:

- When the app loads for the first time, Workbox precaching computes a list, removes duplicates, and downloads/stores those assets during the SW `install` event. citeturn8view1  
- URLs that already include versioning information (like a content hash) are used as cache keys without additional modification. citeturn8view1  
- On a later visit, when a new SW has a different precache list, Workbox determines what’s new/changed, caches them during `install`, and then removes entries no longer present during `activate`. citeturn8view1  

This behavior provides reliable cache busting as long as the HTML entry point updates and the update lifecycle is handled coherently. citeturn13view0turn7view0turn8view1

### Keeping SPA routing correct

A single page application must handle “deep links” (e.g., `/orders/123`) by returning the SPA shell HTML. Workbox formalizes this as the “application shell model”: respond to any **navigation request** with the cached application shell markup so the app boots and client-side routing takes over—even offline. citeturn10view0

There are two Workbox-friendly ways to achieve this:

- **Build-time `navigateFallback` (generateSW):** configure a fallback shell HTML for navigations not explicitly precached. citeturn10view0turn23view0  
- **Runtime `NavigationRoute` + `createHandlerBoundToURL` (injectManifest/custom SW):** `NavigationRoute` matches navigation requests (requests whose mode is `navigate`). citeturn8view0turn20view0  

Workbox routing documentation explicitly notes `NavigationRoute` is for browser navigation requests and only matches when request mode is `navigate`, which is a clean separation from XHR/fetch API calls. citeturn8view0

Workbox precaching also includes helpful URL normalization that reduces SPA edge cases—for example, it can map a request for `/` to `/index.html` via “directory index” behavior. citeturn8view1

### Avoiding the “mixed-version” trap in SPAs

The hardest production failures usually come from **version skew**: old HTML referencing assets that were removed from SW caches or not available on the server, while a new SW version has taken over control.

Workbox calls out this risk explicitly: when an updated service worker starts controlling a page, it may mean assets referenced by the current page are no longer in cache “and possibly also not on server,” and you may need to inform the user or mitigate breakage. citeturn1view0 The lifecycle article similarly cautions that `skipWaiting()` can lead to a new SW controlling pages loaded under an older version, which can break assumptions. citeturn2view0turn12view1

This is exactly why Workbox’s “Handle updates immediately” guidance recommends a deliberate prompt-and-reload flow, and notes that prompting is especially relevant when **precaching HTML**, because users won’t see updated HTML until the updated SW takes control. citeturn7view0

## Workbox capabilities and modern recipes for update management

Workbox is best understood as a cohesive toolkit spanning build-time generation, runtime routing/caching, and window-side lifecycle orchestration:

- **Build tooling (“generateSW” vs “injectManifest”)**: `generateSW` prioritizes simplicity and can precache hashed URLs you don’t know ahead of time; `injectManifest` is for advanced use where you write the SW and get a precache manifest injected. citeturn23view0turn6search1turn4search19  
- **Window-side lifecycle (`workbox-window`)**: provides `waiting`, `installed`, `activated`, and `controlling` events, plus `messageSkipWaiting()` as a standardized mechanism to coordinate page UI with SW activation. citeturn1view0turn7view0  
- **Precaching (`workbox-precaching`)**: maintains an up-to-date precache across installs/activations and provides helpers like `cleanupOutdatedCaches()` to keep storage tidy across Workbox versions. citeturn8view1turn4search18  
- **Recipes (`workbox-recipes`)**: packages common combinations into reusable patterns, such as offline fallback logic. citeturn10view1  
- **Broadcasting updates (`workbox-broadcast-update`)**: sends a structured message (`type: 'CACHE_UPDATED'`) to window clients when a cached response is updated—most often paired with a stale-while-revalidate strategy—so the UI can surface “updated content available” messaging. citeturn19view0turn1view0  
- **Navigation preload (`workbox-navigation-preload`)**: can reduce navigation latency when you *don’t* handle navigations via precached HTML; Workbox explicitly says you don’t need it if you already use an app-shell navigation route. citeturn20view0turn10view0  

Workbox also supplies clear operational guidance around update UX: the platform default requires closing/navigating away from all controlled tabs before the new SW activates, but you can “give the user a heads up” and automate switching by combining a waiting prompt, `messageSkipWaiting`, and reload on control transfer. citeturn7view0turn1view0

## Comprehensive update flow architecture

This section synthesizes a coherent “end-to-end” architecture, combining server cache policy, periodic update checks, and user notification mechanics. Each component is designed to minimize version skew while still leveraging aggressive caching for immutable assets.

### Server and CDN cache settings

**Entry-point HTML (all SPA route entry documents)**  
Use server revalidation on each load of the HTML so new deployments propagate quickly:

```http
Cache-Control: no-cache
```

This aligns with standardized guidance for cache-busting: HTML should revalidate so it can point at fresh hashed assets. citeturn13view0turn16view1turn15view0

If you must prevent shared caching explicitly, add shared-cache controls (e.g., `private` or `s-maxage=0`) based on your CDN behavior; `s-maxage` is specifically defined for shared caches. citeturn13view0turn16view1

**Service worker script (`/sw.js`)**  
Treat as mutable configuration code:

```http
Cache-Control: no-cache
# optionally: Cache-Control: no-cache, s-maxage=0
```

This remains a good defensive default even though some browsers ignore HTTP cache for SW update checks, and is specifically motivated by the historical “cache header delayed updates” failure mode. citeturn11view0turn13view0turn2view0

**Hashed assets (`/assets/*.hash.js`, etc.)**  
Cache hard:

```http
Cache-Control: public, max-age=31536000, immutable
```

Fingerprinting plus long TTL is the canonical “immutable content” pattern. citeturn16view0turn16view1turn13view0

### Service worker update polling logic

Rely on the platform’s normal update checks, but add **explicit polling** for long-lived SPA sessions.

- The spec models “staleness” around a 24-hour update check window. citeturn3view0  
- The lifecycle guidance explicitly recommends calling `update()` on an interval (e.g., hourly) if users may keep the site open a long time without reload. citeturn2view0turn12view0  

A practical pattern is:

- On app load: register SW (safe to call unconditionally in controlled pages). citeturn18view1  
- After registration resolves: set an update interval calling `registration.update()` (while the page is open). citeturn2view0turn12view0  
- Optionally, call `update()` when the tab becomes visible again (to reduce drift).

### Front-end user notification and activation mechanics

Implement a single, consistent update UX:

1. **Detect a waiting worker** (Workbox `waiting` event or baseline `registration.waiting`). citeturn1view0turn18view0  
2. **Notify the user** (“Update available”). Keep the message persistent enough that the user can act—even if it’s triggered multiple times due to repeated refreshes while other tabs remain open. citeturn1view0turn7view0  
3. **On accept:** instruct the waiting SW to run `skipWaiting()`. In Workbox this is `messageSkipWaiting()`; in a custom SW it’s usually a `message` handler that calls `self.skipWaiting()`. citeturn7view0turn12view1  
4. **Reload only after control has transferred.** Workbox’s recommended flow listens for the `controlling` event and then reloads. citeturn7view0  
5. **Ensure predictable control transfer** by using `clients.claim()` in `activate` if your flow needs immediate control changes (and be aware it triggers `controllerchange`). citeturn4search0turn12view1turn1view0  

A minimal SW-side hook for user-driven activation (Workbox’s documented pattern shape) is:

```js
// service worker code (conceptual structure)
addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

This is the exact mechanism Workbox’s “updates with immediacy” flow expects when it sends `SKIP_WAITING`. citeturn7view0turn12view1

### Caching and routing strategy inside the SW

Use a coherent SPA baseline:

- Precache hashed build artifacts and maintain them across activations. citeturn8view1turn23view0  
- Handle navigation requests via an app-shell fallback (`navigateFallback` or a `NavigationRoute`). citeturn10view0turn8view0  
- Be cautious about precaching HTML: if you do, it increases the importance of the prompt-and-reload update UX because updated HTML won’t apply until the new SW takes control. citeturn7view0turn10view0  

If you also use stale-while-revalidate for runtime data, consider broadcasting cache updates to the UI so the user can be nudged when data or content refreshes in the background. citeturn19view0turn1view0

### Resulting “update flow” timeline

A deploy-to-user timeline that avoids common pitfalls looks like this:

- **Deploy:** HTML entry points update (revalidated via `no-cache`), SW script updates (byte-different), hashed assets get new filenames and can be long-cached. citeturn13view0turn16view0turn12view0  
- **Client detects update:** browser fetches SW, sees byte difference, installs new worker. citeturn12view0turn2view0  
- **New worker waits:** if any existing clients are controlled by the old worker, the new worker becomes waiting. citeturn2view0turn3view0turn1view0  
- **UI prompts:** app receives “waiting” signal and asks user to reload/update. citeturn7view0turn1view0  
- **User accepts:** app sends SKIP_WAITING; SW activates; optionally claims clients; app reloads after control transfer. citeturn7view0turn12view1turn4search0  
- **Post-update:** new SW serves coherent HTML+assets, and Workbox precaching cleans outdated entries during activation. citeturn8view1turn7view0  

This architecture aligns incentives across HTTP caching, SW lifecycle safety, and user experience: it is aggressive where URLs are immutable (hashed assets) and conservative where coherence is required (HTML shell, SW script, and activation timing). citeturn16view0turn13view0turn2view0turn7view0