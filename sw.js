// MindDump service worker.
//
// Bump `BUILD` on every release. The browser detects any byte change to
// this file and installs the new SW; we then signal it to take over so
// the open page can refresh into the new version.
//
// Cache strategy:
//   - on install: precache every shell asset, bypassing the HTTP cache,
//     so the new SW genuinely picks up changes on the server.
//   - on activate: drop every previous cache (different BUILD).
//   - on fetch (GET): cache-first for instant boot. On cache miss try
//     network and store the response for next time. When offline and
//     it's a navigation request, fall back to the cached `index.html`
//     so the SPA shell still renders.
const BUILD = "2026-04-25.1";
const CACHE_NAME = "minddump-" + BUILD;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/base.css",
  "./css/month.css",
  "./css/future.css",
  "./css/collections.css",
  "./css/modals.css",
  "./css/settings.css",
  "./css/week.css",
  "./css/responsive.css",
  "./js/core.js",
  "./js/screens.js",
  "./js/collections.js",
  "./js/future.js",
  "./js/week.js",
  "./js/modals.js",
  "./js/main.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    (async function () {
      const cache = await caches.open(CACHE_NAME);
      // Add entries individually (rather than `cache.addAll`) so a single
      // failing URL doesn't abort the entire install.
      await Promise.all(
        ASSETS.map(function (url) {
          // `cache: "no-cache"` forces a conditional revalidation against
          // the server and ignores the browser HTTP cache. Without it a
          // freshly bumped BUILD might still pull a stale asset from
          // `disk cache`.
          return cache
            .add(new Request(url, { cache: "no-cache" }))
            .catch(function (err) {
              console.warn("[sw] failed to precache", url, err);
            });
        })
      );
    })()
  );
  // Don't wait for old clients to close — install ASAP so the new
  // version is ready to take over once the page asks.
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  if (event.request.url.startsWith("chrome-extension:")) return;

  event.respondWith(
    (async function () {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        // Opportunistically cache successful same-origin responses so
        // assets loaded after install (e.g. lazy fonts) are also offline.
        if (
          response &&
          response.ok &&
          (new URL(event.request.url).origin === self.location.origin)
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone).catch(function () {});
          });
        }
        return response;
      } catch (_err) {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return Response.error();
      }
    })()
  );
});

// The page calls this when it has detected a waiting SW and wants the
// new version to take control immediately.
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
