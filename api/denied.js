import { applySecurity } from './_lib/http.js';

/**
 * Fallback endpoint for blocked direct access to static data files.
 * Requests to `/data/*.json` without a Referer from our own site land here
 * via a vercel.json rewrite — we return a hard 403 + `X-Robots-Tag: noindex`
 * so crawlers don't keep it in their cache.
 *
 * Note this is a "keep honest people honest" measure, not cryptography:
 * anyone running the game in a browser already has the data in their
 * DevTools Network tab. The goal is to block bulk scraping and indexing.
 */

export default function handler(req, res) {
  applySecurity(res, { noStore: true });
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.statusCode = 403;
  res.end('Forbidden');
}
