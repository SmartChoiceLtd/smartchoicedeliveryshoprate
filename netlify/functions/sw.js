var CACHE = 'scd-v3';
var STATIC = [
  '/driver.html',
  '/manifest.json',
  '/icon.svg'
];

var DB_NAME = 'scd-queue';
var DB_VERSION = 1;
var STORE_NAME = 'pending-orders';

// Open IndexedDB
function openDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

// Save order to queue
function queueOrder(payload) {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      var req = store.add({ payload: payload, queued_at: new Date().toISOString() });
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

// Get all queued orders
function getQueued() {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var store = tx.objectStore(STORE_NAME);
      var req = store.getAll();
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

// Delete order from queue
function deleteQueued(id) {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      var req = store.delete(id);
      req.onsuccess = function() { resolve(); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

// Try to flush queued orders
function flushQueue() {
  return getQueued().then(function(items) {
    if (!items.length) return;
    console.log('[SW] Flushing', items.length, 'queued orders');
    return Promise.all(items.map(function(item) {
      return fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item.payload)
      }).then(function(res) {
        if (res.ok) {
          console.log('[SW] Queued order sent, removing id:', item.id);
          return deleteQueued(item.id);
        }
      }).catch(function(e) {
        console.log('[SW] Still offline, keeping order id:', item.id);
      });
    }));
  }).then(function() {
    // Notify all clients of queue status
    return getQueued().then(function(remaining) {
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'QUEUE_STATUS', count: remaining.length });
        });
      });
    });
  });
}

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
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Intercept POST to /api/orders — queue if offline
  if (url.includes('/api/orders') && e.request.method === 'POST') {
    e.respondWith(
      e.request.clone().json().then(function(payload) {
        return fetch(e.request).then(function(res) {
          // Online — success, flush any queued orders
          if (res.ok) { flushQueue(); }
          return res;
        }).catch(function() {
          // Offline — save to queue
          return queueOrder(payload).then(function(id) {
            console.log('[SW] Order queued with id:', id);
            // Notify clients
            self.clients.matchAll().then(function(clients) {
              clients.forEach(function(c) {
                c.postMessage({ type: 'ORDER_QUEUED', id: id });
              });
            });
            // Return success response so driver form shows success screen
            return new Response(JSON.stringify({
              success: true,
              queued: true,
              queue_id: id,
              message: 'Saved offline — will send when connection returns'
            }), {
              status: 201,
              headers: { 'content-type': 'application/json' }
            });
          });
        });
      })
    );
    return;
  }

  // Network first for other API calls
  if (url.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(function() {
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'content-type': 'application/json' }
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

// Background sync — flush queue when online
self.addEventListener('sync', function(e) {
  if (e.tag === 'flush-orders') {
    e.waitUntil(flushQueue());
  }
});

// Flush queue when coming back online
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'FLUSH_QUEUE') {
    flushQueue();
  }
});
