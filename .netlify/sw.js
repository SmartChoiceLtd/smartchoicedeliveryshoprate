var CACHE = 'scd-v1';
self.addEventListener('install', function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', function(e) {
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(function() {
      return new Response(JSON.stringify({error:'offline'}), {headers:{'content-type':'application/json'}});
    }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function(cached) {
    return cached || fetch(e.request);
  }));
});
