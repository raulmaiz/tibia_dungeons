# Security Policy

## Supported versions

The game follows a rolling-release model: only the `main` branch (the version
live on https://www.tibia-dungeons.com) receives security fixes. Older
deployed versions are not supported — bugs are addressed by bumping the patch
/ minor version and re-deploying.

## Reporting a vulnerability

Please email **raulmaiz@gmail.com** with the subject `[tibia-dungeons] security`.

Include:
1. A clear description of the issue (what can an attacker do?).
2. Reproduction steps or a proof-of-concept.
3. The affected URL / endpoint / commit if known.
4. Your preferred credit name if you'd like to be acknowledged in the
   changelog once the fix ships.

Please do **not**:
- File a public GitHub issue for anything exploitable.
- Run automated scanners against production — the Hall of Fame and save
  endpoints are rate-limited and noisy scans will just get your IP
  throttled without reaching a human.
- Attempt DoS / stress testing against production.

Expect a first response within a week. For high-severity findings (account
takeover, arbitrary score injection, auth bypass) the fix typically ships
within 72 hours; lower-severity findings are batched into the next release.

## Scope

In scope:
- https://www.tibia-dungeons.com and https://tibia-dungeons.com
- https://*.vercel.app preview deployments of this repo
- API endpoints under `/api/*`

Out of scope:
- Clickjacking on pages without sensitive state
- Missing headers on static assets (SEO/meta only)
- Version-disclosure via the `/api/stats` endpoint (intentional)
- Client-side "cheat" edits to the in-game display (gold, level, items in
  the UI) — the server treats client-declared stats as untrusted and will
  reject impossible progressions when posting to the leaderboard

## Environment

Production requires the following environment variables in Vercel:

| Name                      | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`  | Upstash REST URL (sessions, saves, leaderboard, RL). |
| `UPSTASH_REDIS_REST_TOKEN`| Upstash REST auth token.                             |
| `APP_SECRET`              | 32+ byte random string. Used for HMAC-signing saves. |

Rotating `APP_SECRET` invalidates existing save signatures — the server
falls back to returning them marked as `_tampered: true`. Coordinate
rotation with a one-off script that re-signs saves on load (not included in
the default flow).

## Security architecture

Each request passes through these layers (see `api/_lib/`):

1. **Security headers** — `Strict-Transport-Security`, `X-Content-Type-Options`,
   `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and a strict
   CSP with `report-uri /api/csp-report`.
2. **CORS allow-list** — only the production domains, configured preview
   deployments, and `localhost:5173` are allowed.
3. **Rate limiting** — Upstash-backed fixed windows keyed by IP and/or
   authenticated user. Fail-open on Redis outage.
4. **Input validation** — hand-rolled schema validator with length, range,
   enum, and pattern checks. JSON bodies have hard size and nesting caps
   and reject `__proto__` / `constructor` / `prototype` keys.
5. **Authentication** — session tokens in `HttpOnly; Secure; SameSite=Lax`
   cookies (7-day TTL). `Bearer` headers are still honored for legacy
   clients during the migration window but will be removed later.
6. **CSRF** — double-submit: the server sets a JS-readable `td_csrf`
   cookie on session creation; state-changing requests must echo it in the
   `X-CSRF-Token` header.
7. **Integrity** — saves are signed with HMAC-SHA256 (key = `APP_SECRET`);
   Hall-of-Fame scores are always recomputed server-side from validated
   fields, never taken from the client payload.
