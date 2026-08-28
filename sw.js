// Life OS offline app-shell cache.
// Cache-first: once installed, the app loads instantly with no network
// round-trip and works fully offline. New code only reaches the device
// when the user taps "Check for updates" in Settings (see A.checkForUpdate
// in index.html).
var CACHE_NAME = 'lifeos-cache-v10';
var SCOPE_URL = self.registration.scope;
var SHELL_URL = SCOPE_URL + 'index.html';
var ASSETS = [
  SCOPE_URL,
  SHELL_URL,
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
      // The app shell is the one asset that MUST succeed — if it can't be
      // fetched (e.g. mid-deploy hiccup, network drop), let this whole
      // install fail and reject, so the browser keeps the previous,
      // working service worker active instead of activating a new one
      // with no shell to serve. Icons/manifest are best-effort and
      // shouldn't block install if they're briefly unavailable.
      return fetch(SHELL_URL, { cache: 'reload' }).then(function (resp) {
        if (!resp.ok) throw new Error('shell fetch failed: ' + resp.status);
        return cache.put(SHELL_URL, resp);
      }).then(function () {
        return Promise.all(ASSETS.filter(function (u) { return u !== SHELL_URL; }).map(function (url) {
          return fetch(url, { cache: 'reload' }).then(function (resp) {
            return cache.put(url, resp);
          }).catch(function () { /* icon/manifest missing shouldn't block install */ });
        }));
      });
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
  // full-page load) always resolve to the app shell — regardless of which
  // exact URL was actually navigated to. This is deliberate, not a bug:
  // a home-screen icon's launch URL is baked in by iOS at "Add to Home
  // Screen" time and can't be changed later, so if that URL ever stops
  // existing (a page got renamed/removed in a later version), this is
  // what keeps that icon launching the app instead of hitting a dead
  // link and rendering a 404. It also means a launch never needs the
  // network while offline, which is what stops iOS's "no internet" alert
  // from firing on open.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(SHELL_URL).then(function (cached) {
        if (cached) return cached;
        // Cache miss — fetch the real shell fresh (never the literal
        // requested URL) and re-populate the cache from it.
        return fetch(SHELL_URL, { cache: 'reload' }).then(function (resp) {
          if (!resp.ok) throw new Error('shell fetch failed: ' + resp.status);
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(SHELL_URL, copy); });
          return resp;
        });
      }).catch(function () {
        return caches.match(SHELL_URL);
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
