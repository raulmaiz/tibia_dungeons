# ADR-004: Tooling — Vite + Vitest + ESLint + TypeScript estricto en src

- **Estado**: aceptada (2026-07-01)
- **Contexto**: el legado usa esbuild con scripts propios (uno destructivo: `--prod` borra `game/js`), sin lint ni tests. El workflow del agente nocturno exige `lint && typecheck && test` como gate.

## Decisión

- **Vite** (root `game/`, `outDir dist`) para dev/build/preview. Se eliminan `scripts/build*.js` y `scripts/dev-server.js`.
- **Vitest** para unit tests de dominio (`environment: 'node'`, sin GPU/DOM).
- **ESLint flat config** (typescript-eslint recommended) sobre `game/src` únicamente; `game/js` legado excluido (se borra progresivamente).
- **TypeScript estricto** (`strict: true`) para `game/src`; el typecheck deja de cubrir el legado.
- **Three.js por npm** (bundled, tree-shaken), no CDN — a diferencia de Phaser en el legado.

## Justificación

- Vite = estándar de facto, HMR, cero config para TS/glTF/workers, gratis en Vercel.
- Gate nocturno necesita las tres patas verdes y rápidas (<30s) para no quemar los 2 intentos.
- Excluir el legado del gate evita falsos rojos sobre código sentenciado a borrarse.

## Consecuencias

- `npm run build` deja de ser destructivo (foot-gun histórico eliminado).
- `vercel.json` deberá actualizarse en F6 (T-061, con confirmación del usuario).
- El flujo de versión/changelog legado (`npm run push/release`, sw.js CACHE) queda suspendido hasta F6.
