const CACHE_NAME = 'sovereign-wealth-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/main.js',
  '/main.tsx',
  '/index.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[PWA Service Worker] Cache addAll skipped during install (some files may load dynamically):', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Securely logging API requests and response status codes
function logSecureApiFlow(request, response, error = null) {
  const url = new URL(request.url);
  // Only log API routes to follow transaction and auth flows
  if (!url.pathname.startsWith('/api/')) return;

  // Sanitize URL query parameters to avoid logging tokens or authorization codes
  const sanitizedUrl = url.origin + url.pathname + (url.search ? '?***' : '');
  const method = request.method;

  if (error) {
    console.error(`[PWA Audit Logger] [BREAK DETECTED] Path: ${method} ${sanitizedUrl} - Error: ${error.message || error}`);
    return;
  }

  const status = response ? response.status : 'unknown';
  if (response && !response.ok) {
    console.warn(`[PWA Audit Logger] [BREAK DETECTED] Path: ${method} ${sanitizedUrl} - Status: ${status}`);
  } else {
    console.log(`[PWA Audit Logger] [FLOW OK] Path: ${method} ${sanitizedUrl} - Status: ${status}`);
  }
}

self.addEventListener('fetch', (event) => {
  // Only apply custom fetch logger / cache fallback, ignore chrome-extension URLs
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        logSecureApiFlow(event.request, response);
        return response;
      })
      .catch((err) => {
        logSecureApiFlow(event.request, null, err);
        // Fallback to cache for static resources if network fails
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          throw err;
        });
      })
  );
});
