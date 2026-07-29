var CACHE = 'scd-v2';
var STATIC = [
  '/driver.html',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(STATIC);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  // Network first for API calls
  if (url.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(function() {
        return new Response(JSON.stringify({error:'offline'}), {
          headers:{'content-type':'application/json'}
        });
      })
    );
    return;
  }
  // Cache first for static files
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(response) {
        return caches.open(CACHE).then(function(cache) {
          cache.put(e.request, response.clone());
          return response;
        });
      });
    }).catch(function() {
      return caches.match('/driver.html');
    })
  );
});
