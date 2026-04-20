/**
 * Vercel Edge Middleware — runs before static assets are served.
 *
 * Gates direct access to `/data/*.json` by requiring a Referer from one of
 * our own domains. The goal is to stop bulk scraping (curl, wget, crawlers)
 * and keep the JSON out of search indexes — it is NOT cryptographic
 * protection. Anyone with DevTools open can still see every response the
 * game loads.
 */

export const config = {
  matcher: '/data/:path*',
};

const ALLOWED_REFERER = /^https?:\/\/([a-z0-9-]+\.)*(tibia-dungeons\.com|vercel\.app)(\/|$).*/;

export default function middleware(request) {
  const url = new URL(request.url);
  // Only gate the JSON files — images and other static assets under /data
  // (if any) are harmless to load directly.
  if (!url.pathname.endsWith('.json')) return;

  const referer = request.headers.get('referer') || '';
  if (ALLOWED_REFERER.test(referer)) return;

  return new Response('Forbidden', {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}
