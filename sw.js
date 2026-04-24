// Bumped to v2 after fixing absolute paths that broke installs hosted
// under a subpath (e.g. GitHub Pages). All entries below are relative
// to the SW location, so they resolve correctly regardless of where
// the app is mounted.
const CACHE_NAME = "minddump-v2";

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
    caches.open(CACHE_NAME).then(function (cache) {
      // Add entries one by one so a single 404 doesn't abort the whole
      // install (useful if an asset list drifts from reality).
      return Promise.all(
        ASSETS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn("[sw] failed to cache", url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("chrome-extension")) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).catch(function () {
        // Offline navigation fallback — serve the SPA shell.
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return Response.error();
      });
    })
  );
});
