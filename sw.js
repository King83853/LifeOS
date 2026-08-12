// Life OS offline app-shell cache.
// Cache-first: once installed, the app loads instantly with no network
// round-trip and works fully offline. New code only reaches the device
// when the user taps "Check for updates" in Settings (see A.checkForUpdate
// in index.html), which clears this cache and re-fetches from network.
var CACHE_NAME = 'lifeos-cache-v3';
var SCOPE_URL = self.registration.scope;
var ASSETS = [
  SCOPE_URL,
  SCOPE_URL + 'index.html',
  SCOPE_URL + 'manifest.json',
  SCOPE_URL + 'apple-touch-icon.png',
  SCOPE_URL + 'favicon-32.png',
  SCOPE_URL + 'icon-192.png',
  SCOPE_URL + 'icon-512.png'
];

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
        }).catch(function () { /* icon/manifest missing shouldn't block install */ });
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

  // Navigation requests (the standalone home-screen app launching, or any
  // full-page load) are the ones that trigger iOS's "no internet" alert if
  // they fall through to a real network fetch while offline. Always answer
  // these straight from the cached app shell so a launch never needs the
  // network at all, regardless of the exact URL requested.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(SCOPE_URL + 'index.html').then(function (cached) {
        if (cached) return cached;
        // Cache miss (e.g. right after "Check for updates" cleared it) —
        // fetch fresh AND re-populate the cache, otherwise offline loading
        // stays permanently broken from this point on.
        return fetch(e.request, { cache: 'reload' }).then(function (resp) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(SCOPE_URL + 'index.html', copy); });
          return resp;
        });
      }).catch(function () {
        return caches.match(SCOPE_URL + 'index.html');
      })
    );
    return;
  }

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
