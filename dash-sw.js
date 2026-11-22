// Service worker for the SCD dashboard app only. It makes the dashboard installable as a real app, and lets it open
// with no signal (a tablet on a phone hotspot). It touches nothing else: every other page and every /api call goes
// straight to the network exactly as before, and the dashboard page itself is always fetched fresh when there is signal.
var CACHE = 'scd-dash-v1';
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['/dashboard.html', '/dash-icon-192.png']); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname !== '/dashboard.html') return; // not ours: default network behaviour
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('/dashboard.html', copy); }); }
      return res;
    }).catch(function () { return caches.match('/dashboard.html'); })
  );
});
