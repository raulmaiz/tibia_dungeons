import { applySecurity, applyCors, readBody, clientIp, ok, log } from './_lib/http.js';
import { enforceRateLimit } from './_lib/ratelimit.js';

/**
 * POST /api/csp-report
 *
 * Endpoint configured in the `Content-Security-Policy` header via
 * `report-uri` / `report-to`. Collects real-world CSP violations from
 * browsers so we can tighten the policy iteratively without breaking users.
 *
 * Always returns 204 — browsers don't care about the response body.
 */

export default async function handler(req, res) {
  applySecurity(res, { noStore: true });
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }

  const ip = clientIp(req);
  // Heavy rate limit: if an attacker spams reports we just drop the flood.
  if (await enforceRateLimit(req, res, { bucket: 'csp', subject: ip, limit: 30, windowSec: 60 })) return;

  try {
    const body = await readBody(req, { maxBytes: 8192 });
    const report = body['csp-report'] || body;
    log('warn', 'csp.violation', {
      docUri: report && report['document-uri'],
      blocked: report && report['blocked-uri'],
      violated: report && report['violated-directive'],
      src: report && report['source-file'],
      line: report && report['line-number'],
    });
  } catch {
    // Malformed report — ignore silently, don't let bad data page us.
  }
  res.statusCode = 204;
  return res.end();
}
