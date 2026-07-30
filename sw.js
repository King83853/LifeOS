// Life OS offline app-shell cache.
// Cache-first: once installed, the app loads instantly with no network
// round-trip and works fully offline. New code only reaches the device
// when the user taps "Check for updates" in Settings (see A.checkForUpdate
// in index.html), which clears this cache and re-fetches from network.
var CACHE_NAME = 'lifeos-cache-v1';
var SCOPE_URL = self.registration.scope;
var ASSETS = [SCOPE_URL, SCOPE_URL + 'index.html'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  // Bypass the HTTP cache explicitly — otherwise a stale browser-cached
  // response could get baked into the service worker's cache on first
  // install, defeating the whole point of the update flow.
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(ASSETS.map(function (url) {
        return fetch(url, { cache: 'reload' }).then(function (resp) {
          return cache.put(url, resp);
        });
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request, { cache: 'reload' }).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, copy); });
        return resp;
      }).catch(function () { return cached; });
    })
  );
});
