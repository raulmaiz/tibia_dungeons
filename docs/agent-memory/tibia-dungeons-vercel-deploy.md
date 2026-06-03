---
name: tibia-dungeons-vercel-deploy
description: "How tibia_dungeons deploys — which Vercel project is live, and that git push needs a manual PAT"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6efe8896-2810-41e0-b355-e288ac6b98a4
---

Deploying tibia_dungeons (repo at ~/projects/tibia_dungeons, Vercel CLI authenticated as `raulmaiz-8457`):

- There are TWO Vercel projects in the account. **`tibia_dungeons-main` owns the live player domain `www.tibia-dungeons.com`** — this is the one `vercel --prod --yes` deploys to (the local dir is linked to it; a successful deploy prints `Aliased: https://www.tibia-dungeons.com`). The other project, `tibia_dungeons`, only serves `tibiadungeons.vercel.app` and is a stale duplicate — ignore it.
- Deploy command: `NODE_TLS_REJECT_UNAUTHORIZED=0 vercel --prod --yes` (the TLS flag is the WSL workaround). Vercel builds remotely via `npm run build` (its outputDirectory is `game/`); local `game/js/` is safe.
- **Upstash Redis creds are NOT in `vercel env ls`** (managed by a storage integration). `vercel env pull .env.production.local --environment=production` does retrieve `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` + `APP_SECRET`. Prod admin user already exists in Redis (`user:admin`, role=admin).
- **git push needs a manually-supplied GitHub PAT** — no `gh` auth and no credential helper configured; the origin remote is HTTPS. Push via `git push "https://<token>@github.com/raulmaiz/tibia_dungeons.git" main` and mask the token in output. Don't store the token.
- Release ritual before deploy: bump `game/js/data/version.js`, add a `game/js/data/changelog.js` entry, bump `CACHE` in `game/sw.js`, then build/commit/push/deploy. See [[tibia-dungeons-perf]].
