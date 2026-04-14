const CACHE = 'tibia-dungeons-v1';

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

  // Phaser desde CDN: cache-first (versión fija)
  if (url.hostname === 'unpkg.com') {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Assets estáticos SEO/PWA: cache-first
  if (['/favicon.svg', '/og-image.svg', '/manifest.webmanifest'].includes(path)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
});
