# Tibia Dungeons 3D — Claude Code entry point

Roguelite dungeon crawler en navegador inspirado en Tibia. **En migración total de Phaser 2D → Three.js 3D** con cámara estilo Diablo 4. La versión 2D está archivada en el tag `v2d-final` (inmutable, nunca borrar).

> Este archivo es lo que Claude Code lee al entrar al repo. Para profundidad: [`docs/`](docs/).

## Objetivo y estado actual

- **Objetivo**: juego 3D jugable en navegador, cámara orbital ~57° (zoom rueda, yaw con botón derecho, pitch fijo, lerp), click-to-move sobre grid A*, combate en tiempo real con throttling (mismo `CombatMath`), coste operativo 0 €.
- **Rama de trabajo**: `feat/3d-migration`. `main` sigue siendo la 2D en producción (tibia-dungeons.com) hasta paridad funcional.
- **Backend existente (Vercel serverless + Upstash Redis: auth, saves, leaderboard) se conserva intacto.** No tocar `api/` ni `middleware.js` salvo tarea explícita del backlog.
- **Estado**: ver [`docs/backlog.md`](docs/backlog.md) (fuente de verdad de tareas) y la última bitácora en [`docs/night-log/`](docs/night-log/).
- Plan completo: [`docs/migration-3d.md`](docs/migration-3d.md). Decisiones: [`docs/adr/`](docs/adr/).

## Comandos clave

```bash
npm run dev        # Vite dev server (game/ es el root)
npm run build      # Vite build → game/dist
npm run preview    # sirve el build
npm run lint       # ESLint sobre game/src
npm run typecheck  # tsc --noEmit sobre game/src
npm run test       # Vitest (unit, dominio puro)
```

**Gate obligatorio antes de CADA commit**: `npm run lint && npm run typecheck && npm run test`. Si falla, arreglar antes de continuar (máx. 2 intentos; si no, revertir y bloquear la tarea).

## Estructura

```
game/
├── index.html          ← entry Vite (canvas 3D + overlay HUD DOM)
├── public/assets/      ← glTF, texturas, HDRI (solo CC0/gratuito)
├── src/
│   ├── core/           ← EventBus, config, types
│   ├── domain/         ← lógica pura SIN render: combat, progression, loot, dungeon
│   ├── systems/        ← pathfinding A*, movement, ai, targeting (puros, deps inyectadas)
│   ├── render/         ← Three.js: scene, camera (diablo4), models, instancing, vfx
│   ├── input/          ← click-to-move, hotkeys 1–4, tab-target
│   ├── ui/             ← overlay HTML/CSS (HUD, inventario)
│   └── data/           ← catálogos JSON
├── js/                 ← LEGADO 2D (Phaser). Solo se lee para portar; se borra al alcanzar paridad
api/                    ← backend serverless (NO TOCAR)
docs/                   ← plan, ADRs, backlog, night-log, docs legado
```

## Convenciones

- **Código nuevo en TypeScript** (`game/src`). Al portar módulos legado JS+JSDoc, convertir a TS.
- **Lógica de dominio pura**: nada en `src/domain` o `src/systems` importa de `src/render`. El render escucha por `EventBus` o lee estado.
- **Magic numbers a `src/core/config.ts`**. Nunca inline.
- **Coordenadas**: el mundo lógico es un grid de tiles; la conversión grid↔mundo 3D vive SOLO en `src/core/grid.ts`.
- **Commits**: Conventional Commits, atómicos, en inglés (`feat:`, `fix:`, `docs:`, `test:`, `build:`, `refactor:`, `chore:`). Un tema por commit.
- **Assets**: solo fuentes 0 € (Kenney, Quaternius/KayKit, Mixamo, Poly Haven, AmbientCG). Registrar origen y licencia en `game/public/assets/CREDITS.md`.
- **Dirección de arte**: low-poly estilizado coherente (Quaternius/Kenney).
- **Rendimiento**: objetivo 60 fps en portátil medio. Instancing para tiles, máx. 2–3 luces dinámicas, frustum culling activo.

## Permitido sin preguntar / Requiere confirmación

**Permitido**: editar cualquier archivo dentro del repo (salvo lo prohibido), `npm run *`, `git add/commit/branch/checkout`, crear ramas `feat/*`, tests, docs, borrar código legado 2D de `game/js` ya portado o innecesario (está archivado en `v2d-final`).

**Prohibido / requiere confirmación explícita del usuario**:
- `git push --force` (a cualquier rama), borrar o mover el tag `v2d-final`, borrar `main`.
- Tocar `api/`, `middleware.js`, `vercel.json` de producción, o hacer deploy.
- Instalar dependencias nuevas no listadas en el backlog (si es imprescindible: justificar en un ADR y marcar la tarea como bloqueada para revisión).
- Llamadas a servicios externos de pago o con API key.
- `rm -rf` fuera de `node_modules` / `game/dist`.

## Workflow del agente nocturno

1. Crear rama `feat/night-agent/YYYY-MM-DD` desde `feat/3d-migration`.
2. Tomar tareas de [`docs/backlog.md`](docs/backlog.md) en orden de prioridad. Una tarea = uno o más commits atómicos.
3. Antes de cada commit: `npm run lint && npm run typecheck && npm run test`. Rojo → arreglar (máx. 2 intentos) → si sigue rojo, `git revert`/reset del cambio y marcar tarea **bloqueada** en la bitácora con el motivo.
4. Al completar una tarea: push de la rama y abrir PR contra `feat/3d-migration` (`gh pr create`), marcar la tarea `✅` en el backlog dentro del mismo PR.
5. **Ambigüedad no cubierta por este archivo o el backlog → NO asumir**: marcar bloqueada con la pregunta concreta y pasar a la siguiente tarea.
6. Mantener bitácora en `docs/night-log/YYYY-MM-DD.md` (usar `TEMPLATE.md`): tareas intentadas/completadas/bloqueadas, decisiones técnicas, y al final **resumen ejecutivo con qué revisar primero por la mañana**.
7. **Límite duro: 20 commits por sesión nocturna.** Al llegar, cerrar bitácora y parar.

## Legado 2D (referencia para portar)

La arquitectura 2D está hiper-documentada: [`docs/architecture.md`](docs/architecture.md) (seams `Projection`/`SpriteFactory`/`Renderer`/`EventBus`), [`docs/perf-playbook.md`](docs/perf-playbook.md), [`docs/spell-vfx.md`](docs/spell-vfx.md), how-tos de creature/spell/floor, [`docs/glossary.md`](docs/glossary.md), [`docs/dev-log.md`](docs/dev-log.md). Módulos puros ya identificados para portar: `game/js/engine/systems/CombatMath.js`, `game/js/mechanics/progression.js`, `game/js/mechanics/loot.js`, `game/js/dungeon/generator.js`, `game/js/core/EventBus.js`.

## Versionado y deploy

Sin deploys hasta paridad funcional (F6 del plan). El dominio y los dos proyectos Vercel se documentan en el CLAUDE.md del tag `v2d-final`.
