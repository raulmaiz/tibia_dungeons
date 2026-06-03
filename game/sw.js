const CACHE = 'tibia-dungeons-v15';

// Cache-first: sirve desde cache, si no existe descarga y guarda
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// Network-first: intenta red, si falla usa cache (para JSONs que podrían actualizarse)
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('Network and cache both failed');
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // Imágenes: cache-first (no cambian salvo nuevo deploy)
  if (path.includes('/data/images/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // JSONs de datos del juego: network-first (pueden actualizarse)
  if (path.includes('/data/') && path.endsWith('.json')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cross-origin CDN (unpkg/jsDelivr): let the browser load it natively.
  // Our CSP's connect-src is 'self', so fetch()ing from inside the SW
  // throws — and intercepting-then-failing breaks the <script> tag.
  // Not calling respondWith() passes the request straight to the network.
  if (url.origin !== self.location.origin) return;

  // Assets estáticos SEO/PWA: cache-first
  if (['/favicon.png', '/manifest.webmanifest'].includes(path)
      || path.startsWith('/icons/')
      || path === '/data/images/game/preview.jpg') {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Bundled game JS: network-first. The URL is immutable per deploy
  // (no hash in the filename), but we prefer a fresh copy when online
  // so version bumps propagate without waiting for the SW update cycle.
  if (path.startsWith('/dist/') && path.endsWith('.js')) {
    event.respondWith(networkFirst(event.request));
    return;
  }
});
